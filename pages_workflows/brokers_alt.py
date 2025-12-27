"""
Alternate People/Organizations Prototype (In-Memory/File)
===========================================
This experimental module explores an org/office/team/person/employment model
without changing existing code or databases. It uses a JSON file under
`fixtures/` for persistence and Streamlit for a simple UI.
        
Assumptions implemented:
- An Organization represents any company (brokerage, carrier, vendor, competitor).
- Offices belong to an Organization; display names are not unique; IDs are authoritative.
- A Person is a stable identity; contact lives on Employment, not Person.
- Each Person has at most one active Employment at a time.
- Employment holds email, phone, and optional override DBA/address.
- Teams belong to an Organization; memberships are active/inactive flags.
"""

from __future__ import annotations

import json
import os
import uuid
from dataclasses import dataclass, asdict, field
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime, timedelta

import streamlit as st
import psycopg2
from psycopg2.extras import execute_batch

from core import broker_relationship as broker_rel


# ---------------------
# Storage & Data Models
# ---------------------

DATA_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "fixtures", "brokerage_experiment.json")
DATABASE_URL = os.getenv("DATABASE_URL")
CURRENT_USER = st.session_state.get("current_user", os.getenv("USER", "unknown"))
ADMIN_USERS = set([u.strip() for u in (os.getenv("BROKERS_ALT_ADMIN_USERS") or "").split(",") if u.strip()])

def _get_conn():
    conn = st.session_state.get("_brkr_conn")
    try:
        if conn is not None and conn.closed == 0:
            with conn.cursor() as c:
                c.execute("SELECT 1")
            return conn
    except Exception:
        st.session_state.pop("_brkr_conn", None)
    if not DATABASE_URL:
        st.error("DATABASE_URL not set; brokers_alt requires DB.")
        raise RuntimeError("No DATABASE_URL")
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = True
    st.session_state["_brkr_conn"] = conn
    return conn


def _new_id() -> str:
    return str(uuid.uuid4())


@dataclass
class Address:
    line1: str
    city: str
    state: str
    postal_code: str
    line2: Optional[str] = None
    country: str = "US"


@dataclass
class Organization:
    org_id: str
    name: str  # single required name field
    org_type: str = "brokerage"  # brokerage|carrier|vendor|competitor|other


@dataclass
class Office:
    office_id: str
    org_id: str
    office_name: str  # not unique; display/DBA name
    default_address_id: Optional[str] = None
    status: str = "active"  # active|inactive


@dataclass
class Person:
    person_id: str
    first_name: str
    last_name: str


@dataclass
class Team:
    team_id: str
    team_name: str
    org_id: Optional[str] = None
    status: str = "active"
    description: Optional[str] = None


@dataclass
class Employment:
    employment_id: str
    person_id: str
    org_id: str
    office_id: str
    email: Optional[str] = None
    phone: Optional[str] = None
    active: bool = True
    override_dba_id: Optional[str] = None
    override_address_id: Optional[str] = None


@dataclass
class TeamOffice:
    team_office_id: str
    team_id: str
    office_id: str
    is_primary: bool = False
    role_label: Optional[str] = None


@dataclass
class TeamMembership:
    team_membership_id: str
    team_id: str
    person_id: str
    active: bool = True
    role_label: Optional[str] = None


@dataclass
class Store:
    organizations: Dict[str, Organization] = field(default_factory=dict)
    offices: Dict[str, Office] = field(default_factory=dict)
    people: Dict[str, Person] = field(default_factory=dict)
    teams: Dict[str, Team] = field(default_factory=dict)
    employments: Dict[str, Employment] = field(default_factory=dict)
    team_offices: Dict[str, TeamOffice] = field(default_factory=dict)
    team_memberships: Dict[str, TeamMembership] = field(default_factory=dict)
    # Catalogs
    dba_names: Dict[str, Dict[str, str]] = field(default_factory=dict)  # dba_id -> {org_id,name,normalized}
    org_addresses: Dict[str, Dict[str, Any]] = field(default_factory=dict)  # address_id -> {org_id,address:Address,normalized}
    paper_companies: Dict[str, Dict[str, Any]] = field(default_factory=dict)  # paper_id -> {carrier_org_id,paper_name,paper_org_id,...}

    def to_json(self) -> Dict[str, Any]:
        def _encode(obj):
            if isinstance(obj, Address):
                return asdict(obj)
            if hasattr(obj, "__dict__"):
                d = asdict(obj)
                return d
            return obj

        return {
            "organizations": {k: _encode(v) for k, v in self.organizations.items()},
            "offices": {k: _encode(v) for k, v in self.offices.items()},
            "people": {k: _encode(v) for k, v in self.people.items()},
            "teams": {k: _encode(v) for k, v in self.teams.items()},
            "employments": {k: _encode(v) for k, v in self.employments.items()},
            "team_offices": {k: _encode(v) for k, v in self.team_offices.items()},
            "team_memberships": {k: _encode(v) for k, v in self.team_memberships.items()},
            "dba_names": self.dba_names,
            "org_addresses": {
                k: {"org_id": v["org_id"], "address": _encode(v["address"]), "normalized": v["normalized"]}
                for k, v in self.org_addresses.items()
            },
            "paper_companies": self.paper_companies,
        }

    @staticmethod
    def from_json(data: Dict[str, Any]) -> "Store":
        def _addr(x) -> Optional[Address]:
            if not x:
                return None
            return Address(**x)

        s = Store()
        # New format first
        for k, v in (data.get("organizations") or {}).items():
            if isinstance(v, dict):
                s.organizations[k] = Organization(**v)
        for k, v in (data.get("offices") or {}).items():
            v = dict(v)
            # Backward compat: drop fields we no longer support on Office
            for drop_key in ("phone", "email", "is_hq"):
                v.pop(drop_key, None)
            # Map legacy default_address object into catalog and use id
            if "default_address_id" not in v:
                addr_obj = v.pop("default_address", None)
                if addr_obj:
                    # temp store; actual catalog population happens after Store is created
                    v["_legacy_default_address"] = addr_obj
            # Map legacy brokerage_id -> org_id if needed
            if "org_id" not in v and "brokerage_id" in v:
                v["org_id"] = v.pop("brokerage_id")
            s.offices[k] = Office(**v)
        for k, v in (data.get("people") or {}).items():
            s.people[k] = Person(**v)
        for k, v in (data.get("teams") or {}).items():
            s.teams[k] = Team(**v)
        for k, v in (data.get("employments") or {}).items():
            v = dict(v)
            # Map legacy fields to id-based references
            if "override_dba_id" not in v and "override_dba" in v:
                v.pop("override_dba", None)  # resolved later after catalogs
            if "override_address_id" not in v:
                addr_obj = v.pop("override_address", None)
                if addr_obj:
                    v["_legacy_override_address"] = addr_obj
            s.employments[k] = Employment(**v)
        for k, v in (data.get("team_offices") or {}).items():
            s.team_offices[k] = TeamOffice(**v)
        for k, v in (data.get("team_memberships") or {}).items():
            # map legacy broker_id -> person_id
            if isinstance(v, dict) and "broker_id" in v and "person_id" not in v:
                v = dict(v)
                v["person_id"] = v.pop("broker_id")
            s.team_memberships[k] = TeamMembership(**v)

        # Legacy format mapping (if no organizations present but brokerages exist)
        if not s.organizations and data.get("brokerages"):
            for k, v in (data.get("brokerages") or {}).items():
                if isinstance(v, dict):
                    b_id = v.get("brokerage_id") or k
                    nm = v.get("name") or v.get("legal_name") or v.get("dba_name") or "Unnamed"
                    org_id = b_id
                    s.organizations[org_id] = Organization(org_id=org_id, name=nm, org_type="brokerage")
            # map brokers -> people
            for k, v in (data.get("brokers") or {}).items():
                if isinstance(v, dict):
                    person_id = v.get("broker_id") or k
                    s.people[person_id] = Person(person_id=person_id, first_name=v.get("first_name",""), last_name=v.get("last_name",""))
            # map broker_offices -> employments
            for k, v in (data.get("broker_offices") or {}).items():
                if isinstance(v, dict):
                    employment_id = v.get("broker_office_id") or k
                    person_id = v.get("broker_id")
                    office_id = v.get("office_id")
                    office = s.offices.get(office_id)
                    org_id = office.org_id if office else None
                    s.employments[employment_id] = Employment(
                        employment_id=employment_id,
                        person_id=person_id,
                        org_id=org_id or "",
                        office_id=office_id or "",
                        email=None,
                        phone=None,
                        active=True,
                        override_dba=None,
                        override_address=v.get("override_address") and _addr(v.get("override_address"))
                    )
        # Load catalogs
        s.dba_names = data.get("dba_names") or {}
        # Convert any non-dict rows into dicts
        s.dba_names = {k: dict(v) for k, v in s.dba_names.items()} if s.dba_names else {}
        # Org addresses
        raw_org_addrs = data.get("org_addresses") or {}
        for k, v in raw_org_addrs.items():
            try:
                s.org_addresses[k] = {
                    "org_id": v.get("org_id"),
                    "address": _addr(v.get("address")),
                    "normalized": v.get("normalized"),
                }
            except Exception:
                continue

        # Post-process legacy default_address and employment overrides into catalogs
        def _ensure_address_in_catalog(org_id: str, addr: Address) -> Optional[str]:
            if not org_id or not addr:
                return None
            aid, _ = _find_or_create_org_address(s, org_id, addr)
            return aid

        # Offices default address
        for office in s.offices.values():
            legacy = getattr(office, "_legacy_default_address", None)
            if legacy:
                aid = _ensure_address_in_catalog(office.org_id, legacy)
                office.default_address_id = aid
                try:
                    delattr(office, "_legacy_default_address")
                except Exception:
                    pass

        # Employments override address and dba
        for emp_id, emp in s.employments.items():
            legacy_addr = getattr(emp, "_legacy_override_address", None)
            if legacy_addr:
                aid = _ensure_address_in_catalog(emp.org_id, legacy_addr)
                emp.override_address_id = aid
                try:
                    delattr(emp, "_legacy_override_address")
                except Exception:
                    pass
        # Paper companies
        s.paper_companies = {k: dict(v) for k, v in (data.get("paper_companies") or {}).items()}
        return s


def _ensure_store() -> Store:
    """Load brokers data from DB into an in-memory Store for UI; DB is source of truth."""
    if "_brokers_alt_store" in st.session_state:
        return st.session_state._brokers_alt_store

    conn = _get_conn()
    s = Store()
    try:
        with conn.cursor() as cur:
            # Organizations
            cur.execute("SELECT org_id, name, org_type FROM brkr_organizations")
            for org_id, name, org_type in cur.fetchall():
                s.organizations[str(org_id)] = Organization(org_id=str(org_id), name=name, org_type=org_type)

            # People
            cur.execute("SELECT person_id, first_name, last_name FROM brkr_people")
            for pid, fn, ln in cur.fetchall():
                s.people[str(pid)] = Person(person_id=str(pid), first_name=fn or "", last_name=ln or "")

            # Offices
            cur.execute("SELECT office_id, org_id, office_name, default_address_id, status FROM brkr_offices")
            for off_id, org_id, name, default_addr_id, status in cur.fetchall():
                s.offices[str(off_id)] = Office(
                    office_id=str(off_id), org_id=str(org_id), office_name=name or "", default_address_id=str(default_addr_id) if default_addr_id else None, status=status or "active"
                )

            # DBA names
            cur.execute("SELECT dba_id, org_id, name, normalized FROM brkr_dba_names")
            for did, org_id, nm, norm in cur.fetchall():
                s.dba_names[str(did)] = {"org_id": str(org_id), "name": nm, "normalized": norm}

            # Org addresses
            cur.execute("SELECT address_id, org_id, line1, line2, city, state, postal_code, country, normalized FROM brkr_org_addresses")
            for aid, org_id, l1, l2, city, state, pc, country, norm in cur.fetchall():
                s.org_addresses[str(aid)] = {
                    "org_id": str(org_id),
                    "address": Address(line1=l1 or "", line2=l2, city=city or "", state=state or "", postal_code=pc or "", country=country or "US"),
                    "normalized": norm or "",
                }
            # Paper companies (optional table)
            try:
                cur.execute("SELECT paper_id, carrier_org_id, paper_name FROM brkr_paper_companies")
                for pid, carrier_org_id, paper_name in cur.fetchall():
                    s.paper_companies[str(pid)] = {
                        "paper_id": str(pid),
                        "carrier_org_id": str(carrier_org_id),
                        "paper_name": paper_name,
                    }
            except Exception:
                # Table may not be present yet; ignore for now
                pass

            # Teams
            cur.execute("SELECT team_id, team_name, org_id, status, description FROM brkr_teams")
            for tid, name, org_id, status, desc in cur.fetchall():
                s.teams[str(tid)] = Team(team_id=str(tid), team_name=name or "", org_id=str(org_id) if org_id else None, status=status or "active", description=desc)

            # Team offices
            cur.execute("SELECT team_office_id, team_id, office_id, is_primary, role_label FROM brkr_team_offices")
            for toid, tid, offid, is_primary, role in cur.fetchall():
                s.team_offices[str(toid)] = TeamOffice(team_office_id=str(toid), team_id=str(tid), office_id=str(offid), is_primary=bool(is_primary), role_label=role)

            # Team memberships
            cur.execute("SELECT team_membership_id, team_id, person_id, active, role_label FROM brkr_team_memberships")
            for tmid, tid, pid, active, role in cur.fetchall():
                s.team_memberships[str(tmid)] = TeamMembership(team_membership_id=str(tmid), team_id=str(tid), person_id=str(pid), active=bool(active), role_label=role)

            # Employments
            cur.execute("SELECT employment_id, person_id, org_id, office_id, email, phone, active, override_dba_id, override_address_id FROM brkr_employments")
            for eid, pid, oid, offid, email, phone, active, dba_id, addr_id in cur.fetchall():
                s.employments[str(eid)] = Employment(
                    employment_id=str(eid), person_id=str(pid), org_id=str(oid), office_id=str(offid) if offid else "", email=email, phone=phone, active=bool(active), override_dba_id=str(dba_id) if dba_id else None, override_address_id=str(addr_id) if addr_id else None
                )
    except Exception as e:
        st.error(f"Failed loading brokers data from DB: {e}")
        s = Store()

    st.session_state._brokers_alt_store = s
    return s


# ---------------------
# Normalization helpers
# ---------------------

import re

def _normalize_text(s: str) -> str:
    s = s.strip().lower()
    s = re.sub(r"[^a-z0-9\s]", "", s)
    s = re.sub(r"\s+", " ", s)
    return s

def _normalize_dba(name: str) -> str:
    # Light-weight normalization for dedupe (remove punctuation, collapse spaces)
    return _normalize_text(name)

_ADDR_ABBR = {
    "street": "st",
    "st.": "st",
    "avenue": "ave",
    "ave.": "ave",
    "road": "rd",
    "rd.": "rd",
    "boulevard": "blvd",
    "blvd.": "blvd",
    "drive": "dr",
    "dr.": "dr",
    "lane": "ln",
    "ln.": "ln",
    "suite": "ste",
    "floor": "fl",
    "apartment": "apt",
}

def _normalize_address_key(a: Address) -> str:
    def norm_part(p: str) -> str:
        p = _normalize_text(p)
        for k, v in _ADDR_ABBR.items():
            p = re.sub(fr"\b{k}\b", v, p)
        return p
    parts = [a.line1, a.line2 or "", a.city, a.state, a.postal_code, a.country or "US"]
    parts = [norm_part(p) for p in parts if p]
    return "|".join(parts)

def _find_or_create_dba(store: Store, org_id: str, name: str) -> Tuple[str, Dict[str, str]]:
    if not name:
        return None, None
    norm = _normalize_dba(name)
    for did, row in (store.dba_names or {}).items():
        if row.get("org_id") == org_id and row.get("normalized") == norm:
            return did, row
    dba_id = _new_id()
    row = {"org_id": org_id, "name": name, "normalized": norm}
    store.dba_names[dba_id] = row
    return dba_id, row

def _find_or_create_org_address(store: Store, org_id: str, addr: Address) -> Tuple[str, Dict[str, Any]]:
    if not addr:
        return None, None
    norm = _normalize_address_key(addr)
    for aid, row in (store.org_addresses or {}).items():
        if row.get("org_id") == org_id and row.get("normalized") == norm:
            return aid, row
    aid = _new_id()
    row = {"org_id": org_id, "address": addr, "normalized": norm}
    store.org_addresses[aid] = row
    return aid, row

def _address_to_str(addr: Optional[Address]) -> str:
    if not addr:
        return "—"
    parts = [addr.line1]
    if addr.line2:
        parts.append(addr.line2)
    parts.append(f"{addr.city}, {addr.state} {addr.postal_code}")
    return ", ".join([p for p in parts if p])


def _save_store(store: Store) -> None:
    """Persist the current store to DB (upserts)."""
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            # Organizations
            execute_batch(cur,
                """
                INSERT INTO brkr_organizations (org_id, name, org_type)
                VALUES (%s,%s,%s)
                ON CONFLICT (org_id) DO UPDATE SET name=EXCLUDED.name, org_type=EXCLUDED.org_type, updated_at=now()
                """,
                [(oid, o.name, o.org_type) for oid, o in store.organizations.items()]
            )

            # People
            execute_batch(cur,
                """
                INSERT INTO brkr_people (person_id, first_name, last_name)
                VALUES (%s,%s,%s)
                ON CONFLICT (person_id) DO UPDATE SET first_name=EXCLUDED.first_name, last_name=EXCLUDED.last_name, updated_at=now()
                """,
                [(pid, p.first_name, p.last_name) for pid, p in store.people.items()]
            )

            # Org addresses
            addr_rows = []
            for aid, row in (store.org_addresses or {}).items():
                addr: Address = row.get("address")
                addr_rows.append((aid, row.get("org_id"), addr.line1, addr.line2, addr.city, addr.state, addr.postal_code, addr.country or "US", row.get("normalized")))
            if addr_rows:
                execute_batch(cur,
                    """
                    INSERT INTO brkr_org_addresses (address_id, org_id, line1, line2, city, state, postal_code, country, normalized)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    ON CONFLICT (address_id) DO UPDATE SET
                      org_id=EXCLUDED.org_id,
                      line1=EXCLUDED.line1,
                      line2=EXCLUDED.line2,
                      city=EXCLUDED.city,
                      state=EXCLUDED.state,
                      postal_code=EXCLUDED.postal_code,
                      country=EXCLUDED.country,
                      normalized=EXCLUDED.normalized,
                      updated_at=now()
                    """,
                    addr_rows
                )

            # Offices
            if store.offices:
                execute_batch(cur,
                    """
                    INSERT INTO brkr_offices (office_id, org_id, office_name, default_address_id, status)
                    VALUES (%s,%s,%s,%s,%s)
                    ON CONFLICT (office_id) DO UPDATE SET
                      org_id=EXCLUDED.org_id,
                      office_name=EXCLUDED.office_name,
                      default_address_id=EXCLUDED.default_address_id,
                      status=EXCLUDED.status,
                      updated_at=now()
                    """,
                    [
                        (off.office_id, off.org_id, off.office_name, off.default_address_id, off.status)
                        for off in store.offices.values()
                    ]
                )

            # DBA names
            if store.dba_names:
                execute_batch(cur,
                    """
                    INSERT INTO brkr_dba_names (dba_id, org_id, name, normalized)
                    VALUES (%s,%s,%s,%s)
                    ON CONFLICT (dba_id) DO UPDATE SET name=EXCLUDED.name, normalized=EXCLUDED.normalized, org_id=EXCLUDED.org_id, updated_at=now()
                    """,
                    [(did, row.get("org_id"), row.get("name"), row.get("normalized")) for did, row in store.dba_names.items()]
                )

            # Teams
            if store.teams:
                execute_batch(cur,
                    """
                    INSERT INTO brkr_teams (team_id, team_name, org_id, status, description)
                    VALUES (%s,%s,%s,%s,%s)
                    ON CONFLICT (team_id) DO UPDATE SET team_name=EXCLUDED.team_name, org_id=EXCLUDED.org_id, status=EXCLUDED.status, description=EXCLUDED.description, updated_at=now()
                    """,
                    [(t.team_id, t.team_name, t.org_id, t.status, t.description) for t in store.teams.values()]
                )

            # Team offices
            if store.team_offices:
                execute_batch(cur,
                    """
                    INSERT INTO brkr_team_offices (team_office_id, team_id, office_id, is_primary, role_label)
                    VALUES (%s,%s,%s,%s,%s)
                    ON CONFLICT (team_office_id) DO UPDATE SET team_id=EXCLUDED.team_id, office_id=EXCLUDED.office_id, is_primary=EXCLUDED.is_primary, role_label=EXCLUDED.role_label, updated_at=now()
                    """,
                    [(to.team_office_id, to.team_id, to.office_id, to.is_primary, to.role_label) for to in store.team_offices.values()]
                )

            # Team memberships
            if store.team_memberships:
                execute_batch(cur,
                    """
                    INSERT INTO brkr_team_memberships (team_membership_id, team_id, person_id, active, role_label)
                    VALUES (%s,%s,%s,%s,%s)
                    ON CONFLICT (team_membership_id) DO UPDATE SET team_id=EXCLUDED.team_id, person_id=EXCLUDED.person_id, active=EXCLUDED.active, role_label=EXCLUDED.role_label, updated_at=now()
                    """,
                    [(tm.team_membership_id, tm.team_id, tm.person_id, tm.active, tm.role_label) for tm in store.team_memberships.values()]
                )

            # Employments
            if store.employments:
                execute_batch(cur,
                    """
                    INSERT INTO brkr_employments (employment_id, person_id, org_id, office_id, email, phone, active, override_dba_id, override_address_id)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    ON CONFLICT (employment_id) DO UPDATE SET
                      person_id=EXCLUDED.person_id,
                      org_id=EXCLUDED.org_id,
                      office_id=EXCLUDED.office_id,
                      email=EXCLUDED.email,
                      phone=EXCLUDED.phone,
                      active=EXCLUDED.active,
                      override_dba_id=EXCLUDED.override_dba_id,
                      override_address_id=EXCLUDED.override_address_id,
                      updated_at=now()
                    """,
                    [
                        (e.employment_id, e.person_id, e.org_id, (e.office_id or None), e.email, e.phone, e.active, e.override_dba_id, e.override_address_id)
                        for e in store.employments.values()
                    ]
                )
        st.success("Saved changes to broker directory (DB)")
    except Exception as e:
        st.error(
            f"Failed saving brokers to DB: {e}\n"
            "If this persists, verify brkr_* tables exist and your user has write permissions."
        )


# -------------
# UI Components
# -------------

def _disable_autofill():
    """Disable browser autofill/autocorrect/autocapitalize/spellcheck for all inputs on the page."""
    st.markdown(
        """
        <script>
        (function() {
          const setAttrs = (el) => {
            try {
              el.setAttribute('autocomplete','off');
              el.setAttribute('autocorrect','off');
              el.setAttribute('autocapitalize','none');
              el.setAttribute('spellcheck','false');
            } catch (e) {}
          };
          const apply = () => {
            document.querySelectorAll('input, textarea').forEach(setAttrs);
            document.querySelectorAll('form').forEach(f => f.setAttribute('autocomplete','off'));
          };
          const obs = new MutationObserver(apply);
          obs.observe(document.documentElement, {childList: true, subtree: true});
          apply();
        })();
        </script>
        """,
        unsafe_allow_html=True,
    )

def _subheader_count(label: str, count: int):
    st.subheader(f"{label} ({count})")


# _seed_sample_data function removed as seeding is no longer exposed in UI


def _organizations_section():
    store = _ensure_store()
    _subheader_count("Organizations", len(store.organizations))

    # Apply pending selection to preserve dropdown after save
    if 'org_select_pending' in st.session_state:
        st.session_state['org_select'] = st.session_state.pop('org_select_pending')

    # Search + dropdown on the page, table below inside an expander
    # Make the select dropdown wider at the expense of the search bar
    col_search, col_select = st.columns([1, 1])
    with col_search:
        search = st.text_input("Search organizations", key="org_search").strip().lower()
    # build filtered list for dropdown
    orgs_all = list(store.organizations.values())
    orgs = orgs_all
    if search:
        orgs = [o for o in orgs_all if search in (o.name or '').lower() or search in o.org_type.lower() or search in o.org_id]
    filtered_options = [o.org_id for o in sorted(orgs, key=lambda x: (x.name or '').lower())]
    def _format_org(opt: str) -> str:
        o = store.organizations.get(opt)
        return f"{o.name} [{o.org_type}] (id: {opt[:8]}…)" if o else opt
    with col_select:
        NEW_ORG = "__new_org__"
        options_org = [""] + [NEW_ORG] + filtered_options
        def _format_org_select(opt: str) -> str:
            if opt == "":
                return "— Choose an organization —"
            if opt == NEW_ORG:
                return "Add a new organization"
            return _format_org(opt)
        sel = st.selectbox("Select", options=options_org, format_func=_format_org_select, key="org_select")

    # Editor form (create or update) — only show when an organization is selected (shown above the table)
    if sel:
        with st.form("form_edit_org"):
            NEW_ORG = "__new_org__"
            is_new = (sel == NEW_ORG)
            o = None if is_new else store.organizations.get(sel)
            name = st.text_input("Name *", value=o.name if o else "")
            org_type = st.selectbox(
                "Type",
                options=["brokerage","carrier","vendor","competitor","other"],
                index=["brokerage","carrier","vendor","competitor","other"].index(o.org_type) if o else 0,
            )
            btn_col1, btn_col2, _ = st.columns([4, 4, 4])
            with btn_col1:
                save_clicked = st.form_submit_button("Save Changes")
            with btn_col2:
                cancel_clicked = st.form_submit_button("Cancel")
            if cancel_clicked:
                # Hide fields without saving
                st.session_state['org_select_pending'] = ""
                st.rerun()
            if save_clicked:
                if not name:
                    st.error("Name is required.")
                else:
                    if is_new:
                        oid = _new_id()
                        store.organizations[oid] = Organization(org_id=oid, name=name, org_type=org_type)
                    else:
                        o.name = name
                        o.org_type = org_type
                    _save_store(store)
                    st.success("Changes saved.")
                    # Clear selection to hide fields after save
                    st.session_state['org_select_pending'] = ""
                    st.rerun()

        # Paper companies management (inline under organization editor; only for existing and type=carrier)
        if sel and sel != NEW_ORG:
            # Reflect current selection in the form; if type was changed to carrier but not saved yet,
            # we still show the paper section, but we cannot save papers for a NEW organization.
            curr_type = org_type  # live selection value from the form above
            if curr_type == "carrier":
                # Build list for dropdown
                papers = [v for v in store.paper_companies.values() if v.get("carrier_org_id") == sel]
                papers = sorted(papers, key=lambda r: (r.get("paper_name") or "").lower())
                paper_ids = [p.get("paper_id") for p in papers]

                # Preserve selection after save
                if 'paper_select_pending' in st.session_state:
                    st.session_state['paper_select'] = st.session_state.pop('paper_select_pending')

                # One expander containing: selector, entry form (save/cancel), and table
                with st.expander("Paper Companies", expanded=True):
                    NEW_PAPER = "__new_paper__"
                    options_paper = [""] + [NEW_PAPER] + paper_ids
                    def _format_paper(opt: str) -> str:
                        if opt == "":
                            return "— Choose a paper company —"
                        if opt == NEW_PAPER:
                            return "Add a new paper company"
                        row = next((r for r in papers if r.get("paper_id") == opt), None)
                        if row:
                            return f"{row.get('paper_name') or '(unnamed)'} (id: {opt[:8]}…)"
                        return opt
                    paper_sel = st.selectbox("Paper company", options=options_paper, format_func=_format_paper, key="paper_select")

                    # Editor form for create/update (directly under selector)
                    if paper_sel:
                        with st.form("form_edit_paper"):
                            is_new_paper = (paper_sel == NEW_PAPER)
                            row = None if is_new_paper else next((r for r in papers if r.get("paper_id") == paper_sel), None)
                            paper_name = st.text_input("Paper Company Name *", value=(row.get("paper_name") if row else ""))
                            b1, b2, _ = st.columns([4, 4, 4])
                            with b1:
                                save_clicked = st.form_submit_button("Save Changes")
                            with b2:
                                cancel_clicked = st.form_submit_button("Cancel")
                            if cancel_clicked:
                                st.session_state['paper_select_pending'] = ""
                                st.rerun()
                            if save_clicked:
                                if not paper_name.strip():
                                    st.error("Paper company name is required.")
                                else:
                                    # Prevent duplicates (case-insensitive) within this carrier
                                    existing_names = {
                                        (r.get("paper_name") or "").strip().lower(): r.get("paper_id") for r in papers
                                    }
                                    key = paper_name.strip().lower()
                                    if (key in existing_names) and (is_new_paper or existing_names[key] != paper_sel):
                                        st.error("A paper company with this name already exists for this carrier.")
                                    else:
                                        try:
                                            with _get_conn().cursor() as cur:
                                                if is_new_paper:
                                                    cur.execute(
                                                        """
                                                        INSERT INTO brkr_paper_companies (carrier_org_id, paper_name)
                                                        VALUES (%s,%s)
                                                        RETURNING paper_id
                                                        """,
                                                        (sel, paper_name.strip()),
                                                    )
                                                else:
                                                    cur.execute(
                                                        """
                                                        UPDATE brkr_paper_companies
                                                        SET paper_name = %s, updated_at = now()
                                                        WHERE paper_id = %s
                                                        """,
                                                        (paper_name.strip(), paper_sel),
                                                    )
                                            st.session_state.pop("_brokers_alt_store", None)
                                            st.success("Changes saved.")
                                            st.session_state['paper_select_pending'] = ""
                                            st.rerun()
                                        except Exception as e:
                                            st.error(f"Failed to save: {e}")

                    # Inline table view under the same container
                    rows = [{"Name": r.get("paper_name"), "Paper ID": r.get("paper_id")} for r in papers]
                    if rows:
                        st.dataframe(rows, use_container_width=True, hide_index=True)
                    else:
                        st.info("No paper companies yet for this carrier.")

                    # Advanced admin-only control: reassign paper company to a different carrier
                    allow_advanced = (os.getenv("BROKERS_ALT_ALLOW_ADVANCED", "").lower() in ("1", "true", "yes")) or (CURRENT_USER in ADMIN_USERS)
                    if allow_advanced:
                        with st.expander("Advanced: Reassign paper company", expanded=False):
                            # pick a paper (default to current selection if applicable)
                            paper_opts = [r.get("paper_id") for r in papers]
                            def _fmt_paper(opt: str) -> str:
                                row = next((r for r in papers if r.get("paper_id") == opt), None)
                                return (row.get("paper_name") if row else opt) if opt else opt
                            selected_paper = st.selectbox(
                                "Paper company",
                                options=paper_opts,
                                format_func=_fmt_paper,
                                index=(paper_opts.index(paper_sel) if (paper_sel in paper_opts) else 0) if paper_opts else 0,
                                key="paper_reassign_select",
                            )
                            # destination carrier
                            carriers = [o for o in store.organizations.values() if o.org_type == "carrier"]
                            carriers = sorted(carriers, key=lambda x: (x.name or "").lower())
                            carrier_opts = [o.org_id for o in carriers]
                            def _fmt_carrier(opt: str) -> str:
                                o = store.organizations.get(opt)
                                return o.name if o else opt
                            dest_carrier = st.selectbox(
                                "Move to carrier",
                                options=carrier_opts,
                                format_func=_fmt_carrier,
                                index=carrier_opts.index(sel) if sel in carrier_opts else 0,
                                key="paper_reassign_dest",
                            )
                            col_ra1, col_ra2 = st.columns([1,5])
                            with col_ra1:
                                do_move = st.button("Reassign", key="paper_reassign_btn")
                            if do_move and selected_paper and dest_carrier and dest_carrier != sel:
                                try:
                                    with _get_conn().cursor() as cur:
                                        cur.execute(
                                            """
                                            UPDATE brkr_paper_companies
                                            SET carrier_org_id = %s, updated_at = now()
                                            WHERE paper_id = %s
                                            """,
                                            (dest_carrier, selected_paper),
                                        )
                                    # Clear cached store and reset selection if moved away
                                    st.session_state.pop("_brokers_alt_store", None)
                                    if selected_paper == paper_sel and dest_carrier != sel:
                                        st.session_state['paper_select_pending'] = ""
                                    st.success("Paper company reassigned.")
                                    st.rerun()
                                except Exception as e:
                                    st.error(f"Failed to reassign: {e}")

    with st.expander("📋 Organizations Table", expanded=True):
        table_rows = [{"Name": o.name, "Type": o.org_type, "ID": o.org_id} for o in sorted(orgs, key=lambda x: (x.name or '').lower())]
        if table_rows:
            st.dataframe(table_rows, use_container_width=True, hide_index=True)
        else:
            st.info("No results.")


def _offices_section():
    store = _ensure_store()
    _subheader_count("Offices", len(store.offices))

    # Preserve selection after save
    if 'office_select_pending' in st.session_state:
        st.session_state['office_select'] = st.session_state.pop('office_select_pending')

    # Organization filter above search with clearable "All organizations"
    orgs_map = {o.org_id: o.name for o in store.organizations.values()}
    ALL_ORGS = "__ALL_ORGS__"
    org_filter_opts = [ALL_ORGS] + list(orgs_map.keys()) if orgs_map else [ALL_ORGS]
    if 'office_org_filter' not in st.session_state or st.session_state['office_org_filter'] not in org_filter_opts:
        st.session_state['office_org_filter'] = ALL_ORGS
    org_filter = st.selectbox(
        "Filter by organization",
        options=org_filter_opts,
        format_func=lambda opt: ("All organizations" if opt == ALL_ORGS else orgs_map.get(opt, opt)),
        key="office_org_filter",
        index=org_filter_opts.index(st.session_state['office_org_filter'])
    )

    # Search + dropdown on the page, table below inside an expander
    col_search, col_select = st.columns([1, 1])
    with col_search:
        search = st.text_input("Search offices", key="office_search").strip().lower()
    def office_label(o: Office) -> str:
        # Emphasize the unique address first; include Line 2; drop org name for clarity
        addr = store.org_addresses.get(o.default_address_id, {}).get("address") if o.default_address_id else None
        if addr:
            city_state = ", ".join([p for p in [addr.city, addr.state] if p])
            # Include line2 when present for better disambiguation
            lead = ", ".join([p for p in [addr.line1 or "", addr.line2 or "", city_state] if p])
        else:
            lead = "[No address]"
        office_name = o.office_name or "Office"
        return f"{lead} — {office_name}"

    offices_all = list(store.offices.values())
    if org_filter and org_filter != ALL_ORGS:
        offices_all = [o for o in offices_all if o.org_id == org_filter]
    offices = offices_all
    if search:
        def _addr_parts(o: Office):
            a = store.org_addresses.get(o.default_address_id, {}).get("address") if o.default_address_id else None
            if not a:
                return []
            return [
                (a.line1 or '').lower(),
                (a.line2 or '').lower(),
                (a.city or '').lower(),
                (a.state or '').lower(),
                (a.postal_code or '').lower(),
                (a.country or '').lower(),
            ]
        offices = [
            o for o in offices_all
            if search in (o.office_name or '').lower()
            or (store.organizations.get(o.org_id).name.lower() if store.organizations.get(o.org_id) else '').find(search) != -1
            or any(search in part for part in _addr_parts(o))
        ]

    filtered_options = [o.office_id for o in sorted(offices, key=lambda x: (x.office_name or '').lower())]
    def _format_office(opt: str) -> str:
        o = store.offices.get(opt)
        return (office_label(o) + f" (id: {opt[:8]}…)") if o else opt
    with col_select:
        NEW_OFFICE = "__new_office__"
        options_select = [""] + [NEW_OFFICE] + filtered_options
        def _format_office_select(opt: str) -> str:
            if opt == "":
                return "— Choose an office —"
            if opt == NEW_OFFICE:
                return "Add a new office"
            return _format_office(opt)
        sel = st.selectbox("Edit Address", options=options_select, format_func=_format_office_select, key="office_select")

    # Editor form (address-centric): appears directly under the dropdown when an office is selected
    if sel:
        with st.form("form_edit_office"):
            orgs_map = {o.org_id: o.name for o in store.organizations.values()}
            is_new = (sel == NEW_OFFICE)
            o = None if is_new else store.offices.get(sel)
            options_b = list(orgs_map.keys())
            default_index = options_b.index(o.org_id) if (o and o.org_id in options_b) else 0
            org_id = st.selectbox("Organization *", options=options_b, index=default_index if options_b else 0, format_func=lambda x: orgs_map[x]) if orgs_map else None

            # Load current default address and allow inline edits
            current_addr_id = o.default_address_id if o else None
            curr_addr = store.org_addresses.get(current_addr_id, {}).get("address") if current_addr_id else None
            line1 = st.text_input("Line1", value=curr_addr.line1 if curr_addr else "")
            line2 = st.text_input("Line2", value=curr_addr.line2 if (curr_addr and curr_addr.line2) else "")
            city = st.text_input("City", value=curr_addr.city if curr_addr else "")
            state = st.text_input("State", value=curr_addr.state if curr_addr else "")
            postal = st.text_input("Postal Code", value=curr_addr.postal_code if curr_addr else "")

            btn_col1, btn_col2, _ = st.columns([4, 4, 4])
            with btn_col1:
                save_clicked = st.form_submit_button("Save Changes")
            with btn_col2:
                cancel_clicked = st.form_submit_button("Cancel")
            if cancel_clicked:
                # Hide fields without saving
                st.session_state['office_select_pending'] = ""
                st.rerun()
            if save_clicked:
                if not org_id:
                    st.error("Organization is required.")
                else:
                    if is_new:
                        # Require minimal address for new office
                        if not (line1 and city and state and postal):
                            st.error("Please provide Line1, City, State, and Postal Code for the office address.")
                        else:
                            addr = Address(line1=line1 or "", line2=line2 or None, city=city or "", state=state or "", postal_code=postal or "")
                            aid, _ = _find_or_create_org_address(store, org_id, addr)
                            org = store.organizations.get(org_id)
                            office_name_auto = f"{org.name} - {line1} - {city}" if org else (line1 or "Office")
                            new_oid = _new_id()
                            store.offices[new_oid] = Office(office_id=new_oid, org_id=org_id, office_name=office_name_auto, default_address_id=aid)
                            _save_store(store)
                            st.success("Office created.")
                            st.session_state['office_select_pending'] = ""
                            st.rerun()
                    else:
                        # Update existing office
                        o.org_id = org_id
                        if any([line1, line2, city, state, postal]):
                            new_addr = Address(
                                line1=line1 or "",
                                line2=line2 or None,
                                city=city or "",
                                state=state or "",
                                postal_code=postal or "",
                            )
                            if current_addr_id and current_addr_id in store.org_addresses:
                                row = store.org_addresses[current_addr_id]
                                row["address"] = new_addr
                                row["normalized"] = _normalize_address_key(new_addr)
                            else:
                                aid, _ = _find_or_create_org_address(store, org_id, new_addr)
                                o.default_address_id = aid
                        _save_store(store)
                        st.success("Changes saved.")
                        # Clear the office selection on next run to hide fields
                        st.session_state['office_select_pending'] = ""
                        st.rerun()

    with st.expander("📋 Offices Table", expanded=True):
        rows = []
        for o in sorted(offices, key=lambda x: (x.office_name or '').lower()):
            br = store.organizations.get(o.org_id)
            addr = store.org_addresses.get(o.default_address_id, {}).get("address") if o.default_address_id else None
            rows.append({
                "Organization": br.name if br else o.org_id,
                "Line1": addr.line1 if addr else '',
                "Line2": addr.line2 if addr and addr.line2 else '',
                "City": addr.city if addr else '',
                "State": addr.state if addr else '',
                "Postal": addr.postal_code if addr else '',
                "ID": o.office_id,
            })
        if rows:
            st.dataframe(rows, use_container_width=True, hide_index=True)
        else:
            st.info("No results.")

    # (Editor moved above the Offices table)


def _people_section():
    store = _ensure_store()
    _subheader_count("People", len(store.people))

    # Preserve selection after save
    if 'person_select_pending' in st.session_state:
        st.session_state['person_select'] = st.session_state.pop('person_select_pending')

    # Search + dropdown on the page, table below inside an expander
    # Make search and select 50/50 width
    col_search, col_select = st.columns([1, 1])
    with col_search:
        search = st.text_input("Search people", key="person_search").strip().lower()
    people_all = list(store.people.values())
    people = people_all
    if search:
        people = [
            p for p in people_all
            if search in (f"{p.first_name} {p.last_name}").lower()
        ]
    filtered_options = [p.person_id for p in sorted(people, key=lambda x: (x.last_name or '') + ' ' + (x.first_name or ''))]
    def _format_person(opt: str) -> str:
        p = store.people.get(opt)
        return f"{p.first_name} {p.last_name} (id: {opt[:8]}…)" if p else opt
    with col_select:
        options_person = [""] + filtered_options
        def _format_person_select(opt: str) -> str:
            return "— Choose a person —" if opt == "" else _format_person(opt)
        sel = st.selectbox("Select", options=options_person, format_func=_format_person_select, key="person_select")

    # Editor form (create or update) — show above the table when a person is selected
    if sel:
        with st.form("form_edit_person"):
            p = store.people.get(sel)
            first = st.text_input("First Name *", value=p.first_name if p else "")
            last = st.text_input("Last Name *", value=p.last_name if p else "")
            btn_col1, btn_col2, _ = st.columns([4, 4, 4])
            with btn_col1:
                save_clicked = st.form_submit_button("Save Changes")
            with btn_col2:
                cancel_clicked = st.form_submit_button("Cancel")
            if cancel_clicked:
                # Hide fields without saving
                st.session_state['person_select_pending'] = ""
                st.rerun()
            if save_clicked and p:
                if first and last:
                    p.first_name = first
                    p.last_name = last
                    _save_store(store)
                    st.success("Changes saved.")
                    # Clear selection to hide fields after save
                    st.session_state['person_select_pending'] = ""
                    st.rerun()
                else:
                    st.error("First and Last are required.")

        if st.session_state.get("broker_rel_ok"):
            _person_relationship_panel(store, sel)

    with st.expander("📋 People Table", expanded=True):
        rows = []
        for p in sorted(people, key=lambda x: (x.last_name or '') + ' ' + (x.first_name or '')):
            active_emp = next((e for e in store.employments.values() if e.person_id == p.person_id and e.active), None)
            org = store.organizations.get(active_emp.org_id) if active_emp else None
            off = store.offices.get(active_emp.office_id) if active_emp else None
            rows.append({
                "Name": f"{p.first_name} {p.last_name}",
                "Organization": org.name if org else '',
                "Office": off.office_name if off else '',
                "ID": p.person_id,
            })
        if rows:
            st.dataframe(rows, use_container_width=True, hide_index=True)
        else:
            st.info("No results.")
    # Employment managed separately in the Employment section.


def _person_relationship_panel(store: Store, person_id: str) -> None:
    person = store.people.get(person_id)
    name = f"{person.first_name} {person.last_name}".strip() if person else person_id[:8]

    with st.expander("🗒️ Relationship", expanded=True):
        tab_next, tab_log, tab_timeline = st.tabs(["✅ Next steps", "✍️ Log", "🕒 Timeline"])

        with tab_next:
            items = broker_rel.list_open_next_steps(subject_type="person", subject_id=person_id, limit=25)
            if not items:
                st.caption("No open next steps.")
            for it in items:
                due = it.get("next_step_due_at")
                due_txt = due.strftime("%b %d, %Y") if due else "—"
                cols = st.columns([2, 7, 1, 1])
                with cols[0]:
                    st.caption(due_txt)
                with cols[1]:
                    st.write(it.get("next_step") or it.get("summary") or "")
                with cols[2]:
                    if st.button("Done", key=f"ns_done_{it['id']}", use_container_width=True):
                        broker_rel.update_next_step_status(activity_id=it["id"], status="done")
                        st.rerun()
                with cols[3]:
                    if st.button("Snooze", key=f"ns_snooze_{it['id']}", use_container_width=True):
                        broker_rel.snooze_next_step(activity_id=it["id"], until_at=datetime.utcnow() + timedelta(days=7))
                        st.rerun()

        with tab_log:
            with st.form(f"form_log_activity_{person_id}"):
                st.caption(f"Log an interaction for **{name}**")
                activity_type = st.selectbox(
                    "Type",
                    ["call", "email", "meeting", "visit", "conference", "note"],
                    index=0,
                    key=f"activity_type_{person_id}",
                )
                summary = st.text_area(
                    "Summary",
                    placeholder="1–2 lines…",
                    height=90,
                    key=f"activity_summary_{person_id}",
                )
                tags = st.multiselect(
                    "Tags",
                    ["intro", "market_update", "appetite", "pricing", "renewal", "follow_up", "loss", "relationship_risk"],
                    key=f"activity_tags_{person_id}",
                )
                next_step = st.text_input(
                    "Next step (optional)",
                    placeholder="e.g., Send appetite update",
                    key=f"activity_next_step_{person_id}",
                )
                due = st.date_input("Due date (optional)", value=None, key=f"activity_due_{person_id}")

                active_team_ids = [
                    tm.team_id
                    for tm in store.team_memberships.values()
                    if tm.person_id == person_id and tm.active
                ]
                team_label = {t.team_id: t.team_name for t in store.teams.values()}
                also_link_team_ids = st.multiselect(
                    "Also link to teams (optional)",
                    options=active_team_ids,
                    format_func=lambda x: team_label.get(x, x[:8]),
                    key=f"activity_link_teams_{person_id}",
                )

                submitted = st.form_submit_button("Save", type="primary")
                if submitted:
                    due_at = None
                    if due:
                        due_at = datetime(due.year, due.month, due.day)
                    broker_rel.create_activity(
                        subject_type="person",
                        subject_id=person_id,
                        activity_type=activity_type,
                        summary=summary,
                        tags=tags,
                        next_step=next_step or None,
                        next_step_due_at=due_at,
                        created_by=CURRENT_USER,
                        also_link_team_ids=also_link_team_ids,
                    )
                    st.success("Saved.")
                    st.rerun()

        with tab_timeline:
            activities = broker_rel.list_activities(subject_type="person", subject_id=person_id, limit=50)
            submissions = broker_rel.list_submission_events_for_person(person_id=person_id, limit=25)

            rows: list[dict[str, Any]] = []
            for a in activities:
                rows.append(
                    {
                        "When": a["occurred_at"],
                        "Type": a["activity_type"],
                        "Summary": a["summary"],
                        "Tags": ", ".join(a.get("tags") or []),
                        "Next step": a.get("next_step") or "",
                        "Due": a.get("next_step_due_at"),
                        "Source": "Manual",
                    }
                )
            for s in submissions:
                rows.append(
                    {
                        "When": s["occurred_at"],
                        "Type": "submission",
                        "Summary": f"{s['title']} · {_pretty_token(s.get('status'))} · {_pretty_token(s.get('outcome'))}",
                        "Tags": "",
                        "Next step": "",
                        "Due": None,
                        "Source": "Auto",
                    }
                )

            if not rows:
                st.caption("No activity yet.")
            else:
                df = __import__("pandas").DataFrame(rows).sort_values("When", ascending=False)
                st.dataframe(df, use_container_width=True, hide_index=True)


def _pretty_token(value: Any) -> str:
    if value is None:
        return "—"
    s = str(value).strip()
    if not s:
        return "—"
    return s.replace("_", " ").title()


def _teams_section():
    store = _ensure_store()
    _subheader_count("Teams", len(store.teams))

    # Preserve selection after save
    if 'team_select_pending' in st.session_state:
        st.session_state['team_select'] = st.session_state.pop('team_select_pending')

    # Organization filter above search with clearable "All organizations"
    orgs_map = {o.org_id: o.name for o in store.organizations.values()}
    ALL_ORGS = "__ALL_ORGS__"
    org_filter_opts = [ALL_ORGS] + list(orgs_map.keys()) if orgs_map else [ALL_ORGS]

    # Default to All organizations when none persisted
    if 'team_org_filter' not in st.session_state or st.session_state['team_org_filter'] not in org_filter_opts:
        st.session_state['team_org_filter'] = ALL_ORGS
    org_filter = st.selectbox(
        "Filter by organization",
        options=org_filter_opts,
        format_func=lambda opt: ("All organizations" if opt == ALL_ORGS else orgs_map.get(opt, opt)),
        key="team_org_filter",
        index=org_filter_opts.index(st.session_state['team_org_filter'])
    )

    # Search + dropdown on the page, table below inside an expander
    col_search, col_select = st.columns([1, 1])
    with col_search:
        search = st.text_input("Search teams", key="team_search").strip().lower()
    teams_all = list(store.teams.values())
    if org_filter and org_filter != ALL_ORGS:
        teams_all = [t for t in teams_all if t.org_id == org_filter]
    teams = teams_all
    if search:
        def _team_matches(t: Team) -> bool:
            # Team name
            if search in (t.team_name or '').lower():
                return True
            # Organization name
            org = store.organizations.get(t.org_id)
            if org and search in (org.name or '').lower():
                return True
            # Active member names
            for tm in store.team_memberships.values():
                if tm.team_id == t.team_id and tm.active:
                    person = store.people.get(tm.person_id)
                    full = f"{(person.first_name or '')} {(person.last_name or '')}".strip().lower() if person else ''
                    if search in full:
                        return True
            return False
        teams = [t for t in teams_all if _team_matches(t)]
    filtered_options = [t.team_id for t in sorted(teams, key=lambda x: (x.team_name or '').lower())]
    def _format_team(opt: str) -> str:
        t = store.teams.get(opt)
        return f"{t.team_name} (id: {opt[:8]}…)" if t else opt
    with col_select:
        NEW_TEAM = "__new_team__"
        options_team = [""] + [NEW_TEAM] + filtered_options
        def _format_team_select(opt: str) -> str:
            if opt == "":
                return "— Choose a team —"
            if opt == NEW_TEAM:
                return "Add a new team"
            return _format_team(opt)
        sel = st.selectbox("Select", options=options_team, format_func=_format_team_select, key="team_select")
    # Team details when a team is selected
    if sel == NEW_TEAM:
        # New team creation form (blank fields)
        with st.form("form_create_team"):
            orgs_map = {o.org_id: o.name for o in store.organizations.values()}
            org_opts = list(orgs_map.keys())
            org_id = st.selectbox("Organization *", options=org_opts, index=0 if org_opts else 0, format_func=lambda x: orgs_map[x]) if orgs_map else None
            name = st.text_input("Team Name *", value="")
            desc = st.text_area("Description", value="")
            btn_col1, btn_col2, _ = st.columns([4, 4, 4])
            with btn_col1:
                save_clicked = st.form_submit_button("Save Changes")
            with btn_col2:
                cancel_clicked = st.form_submit_button("Cancel")
            if cancel_clicked:
                st.session_state['team_select_pending'] = ""
                st.rerun()
            if save_clicked:
                if name and org_id:
                    tid = _new_id()
                    store.teams[tid] = Team(team_id=tid, team_name=name, org_id=org_id, description=desc or None)
                    _save_store(store)
                    st.success("Team created.")
                    st.session_state['team_select_pending'] = ""
                    st.rerun()
                else:
                    st.error("Team Name and Organization are required.")
    elif sel:
        # Reset edit mode when changing selected team
        if st.session_state.get('team_edit_team_id') != sel:
            st.session_state['team_edit_team_id'] = sel
            st.session_state['team_edit_mode'] = False

        # Members list for the selected team (shown by default)
        with st.expander("👥 Team Members", expanded=True):
            col_left, col_right = st.columns([1, 3])
            with col_left:
                show_inactive = st.checkbox("Show inactive", key=f"team_show_inactive_{sel}")
            with col_right:
                if st.button("Edit Team", key=f"team_edit_btn_{sel}"):
                    st.session_state['team_edit_mode'] = True
                    st.rerun()
            member_rows = []
            for tm in store.team_memberships.values():
                if tm.team_id != sel:
                    continue
                if not tm.active and not show_inactive:
                    continue
                person = store.people.get(tm.person_id)
                full_name = f"{person.first_name} {person.last_name}".strip() if person else tm.person_id
                member_rows.append({
                    "Name": full_name,
                    "Status": "Active" if tm.active else "Inactive",
                    "Person ID": tm.person_id,
                    "Membership ID": tm.team_membership_id,
                })
            if member_rows:
                st.dataframe(member_rows, use_container_width=True, hide_index=True)
            else:
                st.info("No members for this team.")

        # Editor form (create or update) — only show when Edit is clicked
        if st.session_state.get('team_edit_mode'):
            with st.form("form_edit_team"):
                t = store.teams.get(sel)
                orgs_map = {o.org_id: o.name for o in store.organizations.values()}
                org_opts = list(orgs_map.keys())
                org_idx = org_opts.index(t.org_id) if (t and t.org_id in org_opts) else 0 if org_opts else 0
                org_id = st.selectbox("Organization *", options=org_opts, index=org_idx if org_opts else 0, format_func=lambda x: orgs_map[x]) if orgs_map else None
                name = st.text_input("Team Name *", value=t.team_name if t else "")
                desc = st.text_area("Description", value=t.description if t and t.description else "")
                btn_col1, btn_col2, _ = st.columns([4, 4, 4])
                with btn_col1:
                    save_clicked = st.form_submit_button("Save Changes")
                with btn_col2:
                    cancel_clicked = st.form_submit_button("Cancel")
                if cancel_clicked:
                    # Exit edit mode without saving; keep selection so members remain visible
                    st.session_state['team_edit_mode'] = False
                    st.rerun()
                if save_clicked and t:
                    if name and org_id:
                        t.team_name = name
                        t.org_id = org_id
                        t.description = desc or None
                        _save_store(store)
                        st.success("Changes saved.")
                        # Exit edit mode after save; keep selection
                        st.session_state['team_edit_mode'] = False
                        st.rerun()
                    else:
                        st.error("Team Name and Organization are required.")

    with st.expander("📋 Teams Table", expanded=True):
        rows = []
        for t in sorted(teams, key=lambda x: (x.team_name or '').lower()):
            member_count = sum(1 for tm in store.team_memberships.values() if tm.team_id == t.team_id and tm.active)
            org_name = store.organizations.get(t.org_id).name if (t.org_id and t.org_id in store.organizations) else ''
            rows.append({
                "Team": t.team_name,
                "Organization": org_name,
                "Members": member_count,
                "ID": t.team_id,
            })
        if rows:
            st.dataframe(rows, use_container_width=True, hide_index=True)
        else:
            st.info("No results.")
    

def _dba_section():
    store = _ensure_store()
    _subheader_count("DBAs", len(store.dba_names))

    # Preserve selection after save
    if 'dba_select_pending' in st.session_state:
        st.session_state['dba_select'] = st.session_state.pop('dba_select_pending')

    # Organization filter above search
    orgs_map = {o.org_id: o.name for o in store.organizations.values()}
    ALL_ORGS = "__ALL_ORGS__"
    org_filter_opts = [ALL_ORGS] + list(orgs_map.keys()) if orgs_map else [ALL_ORGS]
    if 'dba_org_filter' not in st.session_state or st.session_state['dba_org_filter'] not in org_filter_opts:
        st.session_state['dba_org_filter'] = ALL_ORGS
    org_filter = st.selectbox(
        "Filter by organization",
        options=org_filter_opts,
        format_func=lambda opt: ("All organizations" if opt == ALL_ORGS else orgs_map.get(opt, opt)),
        key="dba_org_filter",
        index=org_filter_opts.index(st.session_state['dba_org_filter'])
    )

    # Search + dropdown on the page, table below inside an expander
    col_search, col_select = st.columns([1, 1])
    with col_search:
        search = st.text_input("Search DBAs", key="dba_search").strip().lower()

    # Build filtered list
    dba_ids = list(store.dba_names.keys())
    if org_filter and org_filter != ALL_ORGS:
        dba_ids = [did for did in dba_ids if (store.dba_names.get(did) or {}).get("org_id") == org_filter]
    if search:
        dba_ids = [did for did in dba_ids if search in (store.dba_names.get(did, {}).get("name", "").lower())]

    def _format_dba_option(did: str) -> str:
        row = store.dba_names.get(did) or {}
        org_name = orgs_map.get(row.get("org_id"), row.get("org_id", ""))
        return f"{row.get('name','')} — {org_name} (id: {did[:8]}…)"

    filtered_options = sorted(dba_ids, key=lambda did: (store.dba_names.get(did, {}).get('name') or '').lower())
    with col_select:
        NEW_DBA = "__new_dba__"
        options_dba = [""] + [NEW_DBA] + filtered_options
        def _format_dba_select(opt: str) -> str:
            if opt == "":
                return "— Choose a DBA —"
            if opt == NEW_DBA:
                return "Add a new DBA"
            return _format_dba_option(opt)
        sel = st.selectbox("Select", options=options_dba, format_func=_format_dba_select, key="dba_select")

    # Editor form
    if sel:
        with st.form("form_edit_dba"):
            is_new = (sel == NEW_DBA)
            row = None if is_new else store.dba_names.get(sel)
            org_opts = list(orgs_map.keys())
            org_idx = (org_opts.index(row.get("org_id")) if (row and row.get("org_id") in org_opts) else 0) if org_opts else 0
            org_id = st.selectbox("Organization *", options=org_opts, index=org_idx if org_opts else 0, format_func=lambda x: orgs_map[x]) if orgs_map else None
            name_val = st.text_input("DBA Name *", value=(row.get("name") if row else ""))
            btn_col1, btn_col2, _ = st.columns([4, 4, 4])
            with btn_col1:
                save_clicked = st.form_submit_button("Save Changes")
            with btn_col2:
                cancel_clicked = st.form_submit_button("Cancel")
            if cancel_clicked:
                st.session_state['dba_select_pending'] = ""
                st.rerun()
            if save_clicked:
                if not (org_id and name_val):
                    st.error("Organization and DBA Name are required.")
                else:
                    name_norm = _normalize_text(name_val)
                    dup = next((did for did, r in (store.dba_names or {}).items() if r.get("org_id") == org_id and (r.get("normalized") or _normalize_text(r.get("name",""))) == name_norm), None)
                    if is_new:
                        if dup:
                            st.warning("DBA already exists for this organization. Selected it.")
                            st.session_state['dba_select_pending'] = dup
                            st.rerun()
                        dba_id, _ = _find_or_create_dba(store, org_id, name_val)
                        _save_store(store)
                        st.success("DBA created.")
                        st.session_state['dba_select_pending'] = ""
                        st.rerun()
                    else:
                        row['name'] = name_val
                        row['org_id'] = org_id
                        row['normalized'] = name_norm
                        _save_store(store)
                        st.success("Changes saved.")
                        st.session_state['dba_select_pending'] = ""
                        st.rerun()

    # DBAs table (filtered by current org/search)
    with st.expander("📋 DBAs Table", expanded=True):
        table_rows = []
        for did in filtered_options:
            row = store.dba_names.get(did) or {}
            if not row:
                continue
            org_name = orgs_map.get(row.get("org_id"), row.get("org_id", ""))
            table_rows.append({
                "DBA": row.get("name", ""),
                "Organization": org_name,
                "ID": did,
            })
        if table_rows:
            st.dataframe(table_rows, use_container_width=True, hide_index=True)
        else:
            st.info("No results.")

def _finder_section():
    store = _ensure_store()
    st.subheader("Global Finder")
    q = st.text_input("Search across Organizations, People, Addresses, Teams, DBAs", key="finder_q").strip().lower()
    if not q:
        st.info("Type to search.")
        return

    def _match(text: str) -> bool:
        return q in (text or "").lower()

    # Organizations
    org_hits = [o for o in store.organizations.values() if _match(o.name) or _match(o.org_type) or _match(o.org_id)]
    if org_hits:
        st.markdown("### Organizations")
        for o in org_hits[:50]:
            with st.container():
                st.markdown(f"- {o.name} [{o.org_type}] (`{o.org_id[:8]}…`)")
                if st.button("Load in Quick Entry", key=f"finder_org_{o.org_id}"):
                    st.session_state["qe_org_pending"] = o.org_id
                    # Reset downstream locks when jumping
                    st.session_state.pop('qe_contact_locked', None)
                    st.rerun()

    # People
    people_hits = [p for p in store.people.values() if _match(p.first_name) or _match(p.last_name) or _match(p.person_id)]
    if people_hits:
        st.markdown("### People")
        for p in people_hits[:50]:
            full = f"{p.first_name} {p.last_name}".strip()
            # Try to find active employment for context
            emp = next((e for e in store.employments.values() if e.person_id == p.person_id and e.active), None)
            org = store.organizations.get(emp.org_id) if emp else None
            with st.container():
                st.markdown(f"- {full or p.person_id} – {org.name if org else 'No active org'} (`{p.person_id[:8]}…`)")
                if st.button("Load in Quick Entry", key=f"finder_person_{p.person_id}"):
                    if org:
                        st.session_state["qe_org_pending"] = org.org_id
                    st.session_state["qe_person_pending"] = p.person_id
                    st.session_state.pop('qe_contact_locked', None)
                    st.rerun()

    # Addresses
    addr_hits = []
    for aid, row in (store.org_addresses or {}).items():
        a = row.get("address")
        label = f"{a.line1}{(' ' + a.line2) if a and a.line2 else ''}, {a.city}, {a.state} {a.postal_code}" if a else aid
        if a and (_match(a.line1) or _match(a.line2 or '') or _match(a.city) or _match(a.state) or _match(a.postal_code) or _match(label)):
            addr_hits.append((aid, row))
    if addr_hits:
        st.markdown("### Addresses")
        for aid, row in addr_hits[:50]:
            a = row.get("address")
            org = store.organizations.get(row.get("org_id"))
            label = f"{a.line1}{(' ' + a.line2) if a and a.line2 else ''}, {a.city}, {a.state} {a.postal_code}"
            with st.container():
                st.markdown(f"- {label} – {org.name if org else row.get('org_id')} (`{aid[:8]}…`)")
                if st.button("Load in Quick Entry", key=f"finder_addr_{aid}"):
                    if org:
                        st.session_state["qe_org_pending"] = org.org_id
                    st.session_state["qe_office_addr_pending"] = aid
                    st.session_state.pop('qe_contact_locked', None)
                    st.rerun()

    # Teams
    team_hits = [t for t in store.teams.values() if _match(t.team_name) or _match(t.team_id)]
    if team_hits:
        st.markdown("### Teams")
        for t in team_hits[:50]:
            org = store.organizations.get(t.org_id)
            with st.container():
                st.markdown(f"- {t.team_name} – {org.name if org else t.org_id} (`{t.team_id[:8]}…`)")
                if st.button("Load in Quick Entry", key=f"finder_team_{t.team_id}"):
                    if org:
                        st.session_state["qe_org_pending"] = org.org_id
                    st.session_state["qe_team_pending"] = t.team_id
                    st.session_state.pop('qe_contact_locked', None)
                    st.rerun()

    # DBAs
    dba_hits = []
    for did, row in (store.dba_names or {}).items():
        if _match(row.get("name","")):
            dba_hits.append((did, row))
    if dba_hits:
        st.markdown("### DBAs")
        for did, row in dba_hits[:50]:
            org = store.organizations.get(row.get("org_id"))
            with st.container():
                st.markdown(f"- {row.get('name')} – {org.name if org else row.get('org_id')} (`{did[:8]}…`)")
                if st.button("Load in Quick Entry", key=f"finder_dba_{did}"):
                    if org:
                        st.session_state["qe_org_pending"] = org.org_id
                    st.session_state["qe_dba_pending"] = did
                    st.session_state.pop('qe_contact_locked', None)
                    st.rerun()

    # No standalone linking or overview; team membership handled in broker form.


def _employment_section():
    store = _ensure_store()
    _subheader_count("Employment", len(store.employments))

    # Apply pending and build search + select; table rendered below
    if 'emp_select_pending' in st.session_state:
        st.session_state['emp_select'] = st.session_state.pop('emp_select_pending')
    col_search, col_select = st.columns([1, 1])
    with col_search:
        search = st.text_input("Search employments (person/org/email)", key="emp_search").strip().lower()
        show_inactive = st.checkbox("Show inactive", key="emp_show_inactive")
    # Build rows of active employments
    emps_all = list(store.employments.values())
    emps = emps_all if show_inactive else [e for e in emps_all if e.active]
    if search:
        def _row_text(e):
            p = store.people.get(e.person_id)
            o = store.organizations.get(e.org_id)
            return f"{(p.first_name+' '+p.last_name).lower() if p else ''} {(o.name.lower() if o else '')} {(e.email or '').lower()}"
        emps = [e for e in emps if search in _row_text(e)]
    # Build employment options (not person-based) to avoid duplicates
    def _fmt_emp(eid: str) -> str:
        e = store.employments.get(eid)
        if not e:
            return eid
        p = store.people.get(e.person_id)
        org = store.organizations.get(e.org_id)
        off = store.offices.get(e.office_id)
        addr = store.org_addresses.get(e.override_address_id, {}).get("address") if e.override_address_id else (store.org_addresses.get(off.default_address_id, {}).get("address") if off else None)
        person_name = f"{p.first_name} {p.last_name}".strip() if p else e.person_id
        org_name = org.name if org else e.org_id
        addr_str = _address_to_str(addr)
        return f"{person_name} — {org_name} — {addr_str}"
    with col_select:
        options = [""] + [e.employment_id for e in sorted(emps, key=lambda e: (store.people.get(e.person_id).last_name + store.people.get(e.person_id).first_name) if store.people.get(e.person_id) else e.employment_id)]
        sel_emp_id = st.selectbox("Select", options=options, format_func=lambda x: ("— Choose employment —" if x == "" else _fmt_emp(x)), key="emp_select")

    # Employment editor appears above the table
    # Editor form — quick-entry style (no direct office/email/phone fields)
    if sel_emp_id:
        with st.form("form_edit_employment"):
            e = store.employments.get(sel_emp_id)
            # Organization
            orgs_map = {o.org_id: f"{o.name} [{o.org_type}]" for o in store.organizations.values()}
            org_keys = list(orgs_map.keys())
            org_index = (org_keys.index(e.org_id) if e and e.org_id in orgs_map else 0) if org_keys else 0
            org_id = st.selectbox("Organization *", options=org_keys, index=org_index if org_keys else 0, format_func=lambda x: orgs_map[x]) if orgs_map else None
            # Office via Address: choose existing or add new (like Quick Entry)
            office_id = None
            office_address_id = None
            addr_options = [aid for aid, row in (store.org_addresses or {}).items() if row.get("org_id") == org_id] if org_id else []
            addr_label_map = {aid: _address_to_str(store.org_addresses[aid]["address"]) for aid in addr_options}
            addr_select_options = addr_options
            # Preselect current employment address: override first, else office default
            if org_id and e:
                pre_addr_id = e.override_address_id
                if not pre_addr_id:
                    off = store.offices.get(e.office_id)
                    pre_addr_id = off.default_address_id if off else None
                if pre_addr_id and pre_addr_id in addr_options:
                    ss_key = f"emp_office_addr_{sel_emp_id}"
                    if ss_key not in st.session_state:
                        st.session_state[ss_key] = pre_addr_id
            def _fmt_addr(opt: str) -> str:
                return addr_label_map.get(opt, opt)
            sel_addr = st.selectbox("Office Address *", options=addr_select_options, format_func=_fmt_addr, key=f"emp_office_addr_{sel_emp_id}") if org_id else ""
            if sel_addr:
                office_address_id = sel_addr
                # Preselect office if one exists for this address
                existing_off = next((o for o in store.offices.values() if o.org_id == org_id and o.default_address_id == sel_addr), None)
                if existing_off:
                    office_id = existing_off.office_id

            # Team selection
            sel_team = ""
            selected_team = ""
            if org_id:
                teams_for_org = [t for t in store.teams.values() if t.org_id == org_id]
                team_label_map = {t.team_id: t.team_name for t in teams_for_org}
                team_select_options = ["__default_city__"] + list(team_label_map.keys())
                # Preselect person's active team if in this org
                active_tm = next((tm.team_id for tm in store.team_memberships.values() if tm.person_id == e.person_id and tm.active), None) if e else None
                if active_tm and active_tm in team_label_map and f"emp_team_{sel_emp_id}" not in st.session_state:
                    st.session_state[f"emp_team_{sel_emp_id}"] = active_tm
                def _fmt_team_option(opt: str) -> str:
                    if opt == "__default_city__":
                        return "Use Default Team Name by City"
                    return team_label_map.get(opt, opt)
                sel_team = st.selectbox("Team", options=team_select_options, format_func=_fmt_team_option, key=f"emp_team_{sel_emp_id}")
                if sel_team == "__default_city__":
                    # Use city from selected address
                    addr_obj = store.org_addresses.get(office_address_id, {}).get("address") if office_address_id else None
                    city_val = addr_obj.city if addr_obj else None
                    if not city_val:
                        st.info("Select an office address to derive team name by city.")
                    else:
                        org = store.organizations.get(org_id)
                        auto_team_name = f"{org.name} - {city_val}" if org else city_val
                        name_norm = _normalize_text(auto_team_name)
                        dup = next((t for t in teams_for_org if _normalize_text(t.team_name) == name_norm), None)
                        selected_team = dup.team_id if dup else None
                        if not selected_team:
                            tid = _new_id()
                            store.teams[tid] = Team(team_id=tid, team_name=auto_team_name, org_id=org_id, description=None)
                            _save_store(store)
                            selected_team = tid
                else:
                    selected_team = sel_team

            # DBA selection
            selected_dba_id = None
            dba_options = [did for did, row in (store.dba_names or {}).items() if row.get("org_id") == org_id] if org_id else []
            dba_label_map = {did: store.dba_names[did]["name"] for did in dba_options}
            dba_select_options = ["__new_dba__"] + dba_options
            def _fmt_dba(opt: str) -> str:
                if opt == "__new_dba__":
                    return "➕ Add New DBA"
                return dba_label_map.get(opt, opt)
            # Preselect current DBA override if present
            if org_id and e:
                ss_dba_key = f"emp_dba_{sel_emp_id}"
                if ss_dba_key not in st.session_state:
                    st.session_state[ss_dba_key] = e.override_dba_id or ""
            sel_dba = st.selectbox("DBA", options=dba_select_options, format_func=_fmt_dba, key=f"emp_dba_{sel_emp_id}") if org_id else ""
            selected_dba_id = sel_dba or None
            # Contact fields
            email_input = st.text_input("Email", value=(e.email or "") if e else "", key=f"emp_email_{sel_emp_id}")
            phone_input = st.text_input("Phone", value=(e.phone or "") if e else "", key=f"emp_phone_{sel_emp_id}")
            # remove legacy override inputs; DBA handled above

            btn_col1, btn_col2, _ = st.columns([4, 4, 4])
            with btn_col1:
                save_clicked = st.form_submit_button("Save Changes")
            with btn_col2:
                cancel_clicked = st.form_submit_button("Cancel")
            if cancel_clicked:
                st.session_state['emp_select_pending'] = ""
                st.rerun()
            if save_clicked:
                if org_id and (office_id or office_address_id):
                    # Resolve final office from address selection
                    final_office_id = office_id
                    if not final_office_id:
                        # Need an address to bind an office
                        addr_to_use = office_address_id
                        if not addr_to_use:
                            st.error("Please select or add an office address.")
                            return
                        exist_off = next((o for o in store.offices.values() if o.org_id == org_id and o.default_address_id == addr_to_use), None)
                        if exist_off:
                            final_office_id = exist_off.office_id
                        else:
                            org = store.organizations.get(org_id)
                            addr_obj = store.org_addresses.get(addr_to_use, {}).get("address")
                            office_name_auto = f"{org.name} - {addr_obj.line1} - {addr_obj.city}" if (org and addr_obj and addr_obj.line1) else (f"{org.name} - {addr_obj.city}" if (org and addr_obj) else (org.name if org else "Office"))
                            new_oid = _new_id()
                            store.offices[new_oid] = Office(office_id=new_oid, org_id=org_id, office_name=office_name_auto, default_address_id=addr_to_use)
                            final_office_id = new_oid
                            _save_store(store)

                    # Update employment (stay active as-is)
                    e.org_id = org_id
                    e.office_id = final_office_id
                    # Use office default; clear any override address
                    e.override_address_id = None
                    # Contact updates
                    e.email = (email_input or None)
                    e.phone = (phone_input or None)
                    # DBA
                    if selected_dba_id:
                        e.override_dba_id = selected_dba_id
                    # Ensure single active employment per person
                    if e.active:
                        for other in store.employments.values():
                            if other.person_id == e.person_id and other is not e:
                                other.active = False
                    _save_store(store)
                    st.success("Employment saved.")
                    st.session_state['emp_select_pending'] = ""
                    st.rerun()
                else:
                    st.error("Organization and Office Address are required.")

    # Employment table rendered below
    with st.expander("📋 Employment Table", expanded=True):
        rows = []
        for e in emps:
            p = store.people.get(e.person_id)
            org = store.organizations.get(e.org_id)
            off = store.offices.get(e.office_id)
            dba_row = store.dba_names.get(e.override_dba_id)
            addr = store.org_addresses.get(e.override_address_id, {}).get("address") if e.override_address_id else store.org_addresses.get(off.default_address_id, {}).get("address") if off else None
            rows.append({
                "Person": f"{p.first_name if p else ''} {p.last_name if p else ''}",
                "Organization": org.name if org else e.org_id,
                "DBA": dba_row.get("name") if dba_row else (off.office_name if off else ''),
                "Email": e.email or '',
                "Phone": e.phone or '',
                "Address": _address_to_str(addr),
            })
        if rows:
            st.dataframe(rows, use_container_width=True, hide_index=True)
        else:
            st.info("No results.")


def _quick_entry_section():
    store = _ensure_store()
    st.subheader("Single Screen Entry")
    st.caption("Select an organization first; subsequent fields filter to that choice.")
    # Apply any pending widget-state updates before instantiating widgets
    for pending_key, real_key in [
        ("qe_org_pending", "qe_org"),
        ("qe_office_pending", "qe_office"),
        ("qe_office_addr_pending", "qe_office_addr"),
        ("qe_team_pending", "qe_team"),
        ("qe_person_pending", "qe_person"),
        ("qe_dba_pending", "qe_dba"),
        ("qe_dba_mode_pending", "qe_dba_mode"),
        ("qe_addr_pending", "qe_addr"),
        ("qe_addr_mode_pending", "qe_addr_mode"),
    ]:
        if pending_key in st.session_state:
            st.session_state[real_key] = st.session_state[pending_key]
            del st.session_state[pending_key]
    # Top-level dependent selects (auto-rerun on change)
    orgs_map = {o.org_id: f"{o.name} [{o.org_type}]" for o in store.organizations.values()}
    if orgs_map:
        org_options = [""] + ["__new_org__"] + list(orgs_map.keys())
        def _fmt_org(opt: str) -> str:
            if opt == "":
                return "— Choose an organization —"
            if opt == "__new_org__":
                return "➕ Add New Organization"
            return orgs_map.get(opt, opt)
        org_id = st.selectbox("Organization *", options=org_options, format_func=_fmt_org, key="qe_org")
        # Inline add organization when "Add New Organization" selected
        if org_id == "__new_org__":
            with st.form("qe_add_org_existing", clear_on_submit=True):
                col1, col2 = st.columns([2, 1])
                with col1:
                    new_org_name2 = st.text_input("Organization Name *", key="qe_org_name2")
                with col2:
                    new_org_type2 = st.selectbox("Type", options=["brokerage","carrier","vendor","competitor","other"], index=0, key="qe_org_type2")
                submitted = st.form_submit_button("Create Organization")
                if submitted:
                    if not new_org_name2:
                        st.error("Organization Name is required.")
                    else:
                        # Optional duplicate guard by normalized name + type
                        name_norm = _normalize_text(new_org_name2)
                        dup = next((o for o in store.organizations.values() if _normalize_text(o.name) == name_norm and o.org_type == new_org_type2), None)
                        if dup:
                            st.warning(f"Organization already exists: {dup.name} [{dup.org_type}]. No duplicate created.")
                        else:
                            oid = _new_id()
                            store.organizations[oid] = Organization(org_id=oid, name=new_org_name2, org_type=new_org_type2)
                            _save_store(store)
                            st.success("Organization created. Selected it above to continue.")
                            st.session_state["qe_org_pending"] = oid
                            st.rerun()
    else:
        org_id = None
        st.info("No organizations yet. Add one below to get started.")
        with st.form("qe_add_org"):
            col1, col2 = st.columns([2, 1])
            with col1:
                new_org_name = st.text_input("Organization Name *")
            with col2:
                new_org_type = st.selectbox("Type", options=["brokerage","carrier","vendor","competitor","other"], index=0)
            if st.form_submit_button("Create Organization"):
                if new_org_name:
                    oid = _new_id()
                    store.organizations[oid] = Organization(org_id=oid, name=new_org_name, org_type=new_org_type)
                    _save_store(store)
                    st.success("Organization created.")
                    st.session_state["qe_org_pending"] = oid
                    st.rerun()
                else:
                    st.error("Organization Name is required.")

    # Determine selected org id (only real ids count)
    selected_org_id = org_id if (org_id and org_id in orgs_map) else None
    # Ensure downstream locals exist even if sections are skipped
    person_id_sel = None

    # DBA selection now directly under Organization
    sel_dba = ""
    selected_dba_id = None
    dba_name_new = ""
    # Always render DBA; options depend on selected organization
    dba_options = [did for did, row in (store.dba_names or {}).items() if (selected_org_id and row.get("org_id") == selected_org_id)]
    dba_label_map = {did: store.dba_names[did]["name"] for did in dba_options}
    dba_select_options = [""] + (["__new_dba__"] if selected_org_id else []) + dba_options
    def _fmt_dba(opt: str) -> str:
        if opt == "":
            return "— Choose a DBA —"
        if opt == "__new_dba__":
            return "➕ Add New DBA"
        return dba_label_map.get(opt, opt)
    sel_dba = st.selectbox("DBA", options=dba_select_options, format_func=_fmt_dba, key="qe_dba")
    if sel_dba == "__new_dba__" and selected_org_id:
        with st.form("qe_add_dba_inline", clear_on_submit=True):
            dba_name_new = st.text_input("New DBA Name *", key="qe_new_dba_inline")
            dba_submit = st.form_submit_button("Create DBA")
            if dba_submit:
                if not dba_name_new:
                    st.error("DBA Name is required.")
                else:
                    name_norm = _normalize_text(dba_name_new)
                    dup = next((did for did, row in (store.dba_names or {}).items() if row.get("org_id") == selected_org_id and _normalize_text(row.get("name","")) == name_norm), None)
                    dba_id = dup if dup else _find_or_create_dba(store, selected_org_id, dba_name_new)[0]
                    _save_store(store)
                    st.session_state["qe_dba_pending"] = dba_id
                    st.success("DBA created.")
                    st.rerun()
    elif sel_dba:
        selected_dba_id = sel_dba

    # Office selection via Address: choose existing or Add New Address (always visible)
    office_id = None
    office_address_id = None
    addr_options = [aid for aid, row in (store.org_addresses or {}).items() if (selected_org_id and row.get("org_id") == selected_org_id)]
    addr_label_map = {aid: _address_to_str(store.org_addresses[aid]["address"]) for aid in addr_options}
    addr_select_options = [""] + (["__new_address__"] if selected_org_id else []) + addr_options
    def _fmt_addr(opt: str) -> str:
        if opt == "":
            return "— Choose an office address —"
        if opt == "__new_address__":
            return "➕ Add New Address"
        return addr_label_map.get(opt, opt)
    sel_addr = st.selectbox("Office Address *", options=addr_select_options, format_func=_fmt_addr, key="qe_office_addr")
    if sel_addr == "__new_address__" and selected_org_id:
        with st.form("qe_add_office_address", clear_on_submit=True):
            colA1, colA2 = st.columns(2)
            with colA1:
                off_l1 = st.text_input("Line1", key="qe_off_addr_l1")
                off_city = st.text_input("City", key="qe_off_addr_city")
                off_postal = st.text_input("Postal Code", key="qe_off_addr_postal")
            with colA2:
                off_l2 = st.text_input("Line2", key="qe_off_addr_l2")
                off_state = st.text_input("State", key="qe_off_addr_state")
            addr_submit = st.form_submit_button("Create Address")
            if addr_submit:
                if not (off_l1 and off_city and off_state and off_postal):
                    st.error("Please complete address Line1, City, State, and Postal Code.")
                else:
                    new_addr_id, _ = _find_or_create_org_address(
                        store,
                        selected_org_id,
                        Address(line1=off_l1 or "", line2=off_l2 or None, city=off_city or "", state=off_state or "", postal_code=off_postal or "")
                    )
                    st.session_state["qe_office_addr_pending"] = new_addr_id
                    st.success("Address created.")
                    st.rerun()
    elif sel_addr:
        office_address_id = sel_addr
        if selected_org_id:
            existing_off = next((o for o in store.offices.values() if o.org_id == selected_org_id and o.default_address_id == sel_addr), None)
            if existing_off:
                office_id = existing_off.office_id
            # Removed preview caption under Office Address per request

    # Team selection directly after Office Address
    sel_team = ""
    selected_team = ""
    teams_for_org = [t for t in store.teams.values() if (selected_org_id and t.org_id == selected_org_id)]
    team_label_map = {t.team_id: t.team_name for t in teams_for_org}
    team_select_options = [""] + (["__new_team__", "__default_city__"] if selected_org_id else []) + list(team_label_map.keys())
    def _fmt_team_option(opt: str) -> str:
        if opt == "":
            return "— Choose a team —"
        if opt == "__new_team__":
            return "➕ Add New Team"
        if opt == "__default_city__":
            return "Use Default Team Name by City"
        return team_label_map.get(opt, opt)
    sel_team = st.selectbox("Team", options=team_select_options, format_func=_fmt_team_option, key="qe_team")
    if sel_team == "__new_team__":
        with st.form("qe_add_team_inline", clear_on_submit=True):
            colT1, colT2 = st.columns([2, 3])
            with colT1:
                team_name_new = st.text_input("Team Name *", key="qe_team_name_inline")
            with colT2:
                team_desc_new = st.text_input("Description", key="qe_team_desc_inline")
            team_submit = st.form_submit_button("Create Team")
            if team_submit:
                if not team_name_new:
                    st.error("Team Name is required.")
                else:
                    name_norm = _normalize_text(team_name_new)
                    dup = next((t for t in teams_for_org if _normalize_text(t.team_name) == name_norm), None)
                    if dup:
                        st.session_state["qe_team_pending"] = dup.team_id
                        st.warning(f"Team already exists: {dup.team_name}. Selected it.")
                    else:
                        tid = _new_id()
                        store.teams[tid] = Team(team_id=tid, team_name=team_name_new, org_id=selected_org_id, description=team_desc_new or None)
                        _save_store(store)
                        st.session_state["qe_team_pending"] = tid
                        st.success("Team created.")
                    st.rerun()
    elif sel_team == "__default_city__":
        with st.form("qe_add_team_default_city", clear_on_submit=True):
            default_submit = st.form_submit_button("Create Default Team")
            if default_submit:
                # Need a selected address to derive city
                if 'sel_addr' not in locals() or sel_addr == "__new_address__":
                    st.error("Select an office address first.")
                else:
                    addr_obj = store.org_addresses.get(sel_addr, {}).get("address")
                    city_val = addr_obj.city if addr_obj else None
                    if not city_val:
                        st.error("Selected address has no city.")
                    else:
                        org = store.organizations.get(selected_org_id)
                        auto_team_name = f"{org.name} - {city_val}" if org else city_val
                        name_norm = _normalize_text(auto_team_name)
                        dup = next((t for t in teams_for_org if _normalize_text(t.team_name) == name_norm), None)
                        if dup:
                            st.session_state["qe_team_pending"] = dup.team_id
                            st.warning(f"Team already exists: {dup.team_name}. Selected it.")
                        else:
                            tid = _new_id()
                            store.teams[tid] = Team(team_id=tid, team_name=auto_team_name, org_id=selected_org_id, description=None)
                            _save_store(store)
                            st.session_state["qe_team_pending"] = tid
                            st.success("Team created.")
                        st.rerun()
    elif sel_team not in ("", "__new_team__", "__default_city__"):
        selected_team = sel_team

        # (Person selection moved to be always visible below)

    # Person selection (always visible)
    # Person selection is removed for Quick Entry; use inline fields below

    # Quick Entry form: First/Last/Email/Phone + Save/Cancel
    with st.form("form_quick_entry"):
        colP1, colP2 = st.columns(2)
        with colP1:
            first_name_input = st.text_input("First Name *", key="qe_first_input")
        with colP2:
            last_name_input = st.text_input("Last Name *", key="qe_last_input")
        colC1, colC2 = st.columns(2)
        with colC1:
            email_input = st.text_input("Email *", key="qe_email_input")
        with colC2:
            phone_input = st.text_input("Phone", key="qe_phone_input")
        colB1, colB2 = st.columns(2)
        with colB1:
            save_clicked = st.form_submit_button("Save")
        with colB2:
            cancel_clicked = st.form_submit_button("Cancel")

    if cancel_clicked:
        # Reset Quick Entry session state and set dropdowns back to placeholder
        for k in list(st.session_state.keys()):
            if k.startswith("qe_"):
                st.session_state.pop(k, None)
        # Explicitly clear input fields and dropdown selections
        st.session_state['qe_first_input'] = ""
        st.session_state['qe_last_input'] = ""
        st.session_state['qe_email_input'] = ""
        st.session_state['qe_phone_input'] = ""
        st.session_state['qe_org'] = ""
        st.session_state['qe_dba'] = ""
        st.session_state['qe_office_addr'] = ""
        st.session_state['qe_team'] = ""
        st.rerun()

    if save_clicked:
        if not selected_org_id:
            st.error("Organization is required.")
            st.stop()
        if not (first_name_input and last_name_input and email_input):
            st.error("First name, last name, and email are required.")
            st.stop()
        if not (sel_addr and sel_addr != "__new_address__"):
            st.error("Please choose an office address.")
            st.stop()
        if not selected_team:
            st.error("Please choose a team.")
            st.stop()
        if not selected_dba_id:
            st.error("Please choose a DBA.")
            st.stop()

        # Create person
        pid = _new_id()
        store.people[pid] = Person(person_id=pid, first_name=first_name_input.strip(), last_name=last_name_input.strip())

        # Resolve office for selected address
        final_office_id = None
        exist_off = next((o for o in store.offices.values() if o.org_id == selected_org_id and o.default_address_id == sel_addr), None)
        if exist_off:
            final_office_id = exist_off.office_id
        else:
            # Auto-create an office for this org at the selected address
            org = store.organizations.get(selected_org_id)
            addr_obj = (store.org_addresses.get(sel_addr) or {}).get("address")
            office_name_auto = (
                f"{org.name} - {addr_obj.line1} - {addr_obj.city}" if (org and addr_obj and getattr(addr_obj, 'line1', None)) else
                (f"{org.name} - {getattr(addr_obj, 'city', '')}" if (org and addr_obj) else (org.name if org else "Office"))
            )
            new_oid = _new_id()
            store.offices[new_oid] = Office(
                office_id=new_oid,
                org_id=selected_org_id,
                office_name=office_name_auto,
                default_address_id=sel_addr,
            )
            final_office_id = new_oid

        # Create employment
        emp_id = _new_id()
        store.employments[emp_id] = Employment(
            employment_id=emp_id,
            person_id=pid,
            org_id=selected_org_id,
            office_id=final_office_id or "",
            email=email_input.strip(),
            phone=(phone_input.strip() or None),
            active=True,
            override_dba_id=selected_dba_id,
            override_address_id=sel_addr,
        )
        _save_store(store)
        st.success("Saved person + employment.")
        # Reset to initial state, return dropdowns to placeholder, clear inputs
        for k in list(st.session_state.keys()):
            if k.startswith("qe_"):
                st.session_state.pop(k, None)
        st.session_state['qe_first_input'] = ""
        st.session_state['qe_last_input'] = ""
        st.session_state['qe_email_input'] = ""
        st.session_state['qe_phone_input'] = ""
        st.session_state['qe_org'] = ""
        st.session_state['qe_dba'] = ""
        st.session_state['qe_office_addr'] = ""
        st.session_state['qe_team'] = ""
        st.rerun()

    # (Removed) separate bottom team creation expander to avoid duplicates and nested forms

def render():
    """Render the alternate Brokers prototype page."""
    st.title("🏢 Brokers")
    st.caption("Manage broker organizations, teams, people, and relationship activities (notes/visits/reminders).")

    # Disable browser autofill behaviors for this page
    _disable_autofill()

    ok, err = broker_rel.ensure_tables()
    st.session_state["broker_rel_ok"] = ok
    if not ok:
        st.warning(
            "Broker relationship tables are not available yet (activities/next steps). "
            "Run `db_setup/create_broker_relationship_tables.sql` or grant DB permissions."
        )
        if err:
            st.caption(f"DB error: {err}")

    tab0, tab_outreach, tab1, tab2, tab_dba, tab3, tab4, tab5 = st.tabs([
        "🧭 Quick Entry", "📣 Outreach", "🏢 Organizations", "🏬 Offices", "🏷️ DBAs", "👥 Teams", "👤 People", "💼 Employment",
    ])

    with tab0:
        _quick_entry_section()

    with tab_outreach:
        _outreach_section()

    with tab1:
        _organizations_section()
    with tab2:
        _offices_section()
    with tab_dba:
        _dba_section()
    with tab3:
        _teams_section()
    with tab4:
        _people_section()
    with tab5:
        _employment_section()


def _outreach_section():
    store = _ensure_store()
    st.subheader("Outreach Recommendations")
    st.caption("Rules-based suggestions based on submissions + last touchpoints. v1: person-level.")

    if not st.session_state.get("broker_rel_ok"):
        st.info("Broker relationship tables are not available yet.")
        return

    @st.dialog("Log touchpoint")
    def _log_touch_dialog(person_id: str):
        person = store.people.get(person_id)
        name = f"{person.first_name} {person.last_name}".strip() if person else person_id[:8]
        st.write(f"**{name}**")
        activity_type = st.selectbox("Type", ["call", "email", "meeting", "visit", "conference", "note"], index=0)
        summary = st.text_area("Summary", placeholder="1–2 lines…", height=120)
        tags = st.multiselect(
            "Tags",
            ["intro", "market_update", "appetite", "pricing", "renewal", "follow_up", "loss", "relationship_risk"],
        )
        next_step = st.text_input("Next step (optional)", placeholder="e.g., Send appetite update")
        due = st.date_input("Due date (optional)", value=None)
        if st.button("Save", type="primary"):
            due_at = None
            if due:
                due_at = datetime(due.year, due.month, due.day)
            broker_rel.create_activity(
                subject_type="person",
                subject_id=person_id,
                activity_type=activity_type,
                summary=summary,
                tags=tags,
                next_step=next_step or None,
                next_step_due_at=due_at,
                created_by=CURRENT_USER,
            )
            st.success("Saved.")
            st.rerun()

    recs = broker_rel.outreach_recommendations_people(limit=30)
    if not recs:
        st.info("No outreach recommendations available yet.")
        return

    for rec in recs:
        cols = st.columns([4, 2, 2, 3, 1])
        with cols[0]:
            st.markdown(f"**{rec['name']}**")
            st.caption(" · ".join(rec["reasons"][:2]))
        with cols[1]:
            st.caption("Subs (90d)")
            st.write(rec["subs_90d"])
        with cols[2]:
            st.caption("Written (365d)")
            st.write(f"${rec['written_premium_365d']:,.0f}" if rec["written_premium_365d"] else "—")
        with cols[3]:
            st.caption("Suggested")
            st.write(rec["suggested_action"])
        with cols[4]:
            if st.button("Log", key=f"log_touch_{rec['person_id']}"):
                _log_touch_dialog(rec["person_id"])
