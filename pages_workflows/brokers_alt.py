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

import streamlit as st


# ---------------------
# Storage & Data Models
# ---------------------

DATA_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "fixtures", "brokerage_experiment.json")


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
        return s


def _ensure_store() -> Store:
    if "_brokers_alt_store" not in st.session_state:
        if os.path.exists(DATA_PATH):
            try:
                with open(DATA_PATH, "r", encoding="utf-8") as f:
                    data = json.load(f)
                st.session_state._brokers_alt_store = Store.from_json(data)
            except Exception:
                st.session_state._brokers_alt_store = Store()
        else:
            st.session_state._brokers_alt_store = Store()
    return st.session_state._brokers_alt_store


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
    os.makedirs(os.path.dirname(DATA_PATH), exist_ok=True)
    with open(DATA_PATH, "w", encoding="utf-8") as f:
        json.dump(store.to_json(), f, indent=2)


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


def _seed_sample_data():
    store = _ensure_store()
    if store.organizations:
        st.info("Sample data already present. Skipping seed.")
        return

    # Organization (brokerage)
    org_id = _new_id()
    store.organizations[org_id] = Organization(org_id=org_id, name="Acme Brokerage LLC", org_type="brokerage")

    # Offices (two sharing the same display name/DBA, different cities)
    off1 = _new_id()
    addr1 = Address(line1="123 Main St", city="New York", state="NY", postal_code="10001")
    addr1_id, _ = _find_or_create_org_address(store, org_id, addr1)
    store.offices[off1] = Office(
        office_id=off1,
        org_id=org_id,
        office_name="Acme Insurance",  # non-unique display name
        default_address_id=addr1_id,
    )
    off2 = _new_id()
    addr2 = Address(line1="500 Market St", city="Boston", state="MA", postal_code="02108")
    addr2_id, _ = _find_or_create_org_address(store, org_id, addr2)
    store.offices[off2] = Office(
        office_id=off2,
        org_id=org_id,
        office_name="Acme Insurance",  # same DBA string
        default_address_id=addr2_id,
    )

    # Team (scoped to organization)
    t1 = _new_id()
    store.teams[t1] = Team(team_id=t1, team_name="Large Accounts", org_id=org_id)

    # People
    p1 = _new_id()
    store.people[p1] = Person(person_id=p1, first_name="Jordan", last_name="Smith")
    p2 = _new_id()
    store.people[p2] = Person(person_id=p2, first_name="Avery", last_name="Lee")

    # Employments, with override DBA and address on p1
    # DBA catalog
    dba1_id, _ = _find_or_create_dba(store, org_id, "Acme Insurance")

    e1 = _new_id()
    store.employments[e1] = Employment(
        employment_id=e1,
        person_id=p1,
        org_id=org_id,
        office_id=off1,
        email="jordan@example.com",
        phone=None,
        active=True,
        override_dba_id=dba1_id,
        override_address_id=None,
    )
    e2 = _new_id()
    store.employments[e2] = Employment(
        employment_id=e2,
        person_id=p2,
        org_id=org_id,
        office_id=off2,
        email="avery@example.com",
        phone=None,
        active=True,
        override_dba_id=_find_or_create_dba(store, org_id, "Acme Boston")[0],
        override_address_id=_find_or_create_org_address(store, org_id, Address(line1="500 Market St", line2="Floor 8", city="Boston", state="MA", postal_code="02108"))[0],
    )

    # Team memberships (no office context)
    tm1 = _new_id()
    store.team_memberships[tm1] = TeamMembership(
        team_membership_id=tm1, team_id=t1, person_id=p1, active=True, role_label="Lead"
    )
    tm2 = _new_id()
    store.team_memberships[tm2] = TeamMembership(
        team_membership_id=tm2, team_id=t1, person_id=p2, active=True, role_label="Member"
    )

    _save_store(store)
    st.success("Seeded sample data.")


def _organizations_section():
    store = _ensure_store()
    _subheader_count("Organizations", len(store.organizations))

    # Apply pending selection to preserve dropdown after save
    if 'org_select_pending' in st.session_state:
        st.session_state['org_select'] = st.session_state.pop('org_select_pending')

    # Search + dropdown on the page, table below inside an expander
    # Make the select dropdown wider at the expense of the search bar
    col_search, col_select = st.columns([1, 2])
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
        sel = st.selectbox("Select", options=filtered_options, format_func=_format_org, key="org_select")

    with st.expander("📋 Organizations Table", expanded=True):
        table_rows = [{"Name": o.name, "Type": o.org_type, "ID": o.org_id} for o in sorted(orgs, key=lambda x: (x.name or '').lower())]
        if table_rows:
            st.dataframe(table_rows, use_container_width=True, hide_index=True)
        else:
            st.info("No results.")

    # Editor form (create or update)
    with st.form("form_edit_org"):
        o = store.organizations.get(sel)
        name = st.text_input("Name *", value=o.name if o else "")
        org_type = st.selectbox("Type", options=["brokerage","carrier","vendor","competitor","other"], index=["brokerage","carrier","vendor","competitor","other"].index(o.org_type) if o else 0)
        submitted = st.form_submit_button("Save Changes")
        if submitted and o:
            if name:
                o.name = name
                o.org_type = org_type
                _save_store(store)
                st.success("Changes saved.")
                # Preserve current selection after rerun
                st.session_state['org_select_pending'] = sel
                st.rerun()
            else:
                st.error("Name is required.")


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
    col_search, col_select = st.columns([2, 1])
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
        sel = st.selectbox("Select", options=filtered_options, format_func=_format_office, key="office_select")

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

    # Editor form (address-centric)
    with st.form("form_edit_office"):
        orgs_map = {o.org_id: o.name for o in store.organizations.values()}
        o = store.offices.get(sel)
        options_b = list(orgs_map.keys())
        default_index = options_b.index(o.org_id) if (o and o.org_id in options_b) else 0
        org_id = st.selectbox("Organization *", options=options_b, index=default_index if options_b else 0, format_func=lambda x: orgs_map[x]) if orgs_map else None
        # Office address fields (drop-down removed; edit or add inline)
        current_addr_id = o.default_address_id if o else None
        curr_addr = store.org_addresses.get(current_addr_id, {}).get("address") if current_addr_id else None
        line1 = st.text_input("Line1", value=curr_addr.line1 if curr_addr else "")
        line2 = st.text_input("Line2", value=curr_addr.line2 if curr_addr and curr_addr.line2 else "")
        city = st.text_input("City", value=curr_addr.city if curr_addr else "")
        state = st.text_input("State", value=curr_addr.state if curr_addr else "")
        postal = st.text_input("Postal Code", value=curr_addr.postal_code if curr_addr else "")
        submitted = st.form_submit_button("Save Changes")
        if submitted and o:
            if org_id:
                o.org_id = org_id
                if line1 or city or state or postal or line2:
                    aid, _ = _find_or_create_org_address(
                        store,
                        org_id,
                        Address(
                            line1=line1 or "",
                            line2=line2 or None,
                            city=city or "",
                            state=state or "",
                            postal_code=postal or "",
                        ),
                    )
                    o.default_address_id = aid
                _save_store(store)
                st.success("Changes saved.")
                # Preserve current selection after rerun
                st.session_state['office_select_pending'] = sel
                st.rerun()
            else:
                st.error("Organization is required.")


def _people_section():
    store = _ensure_store()
    _subheader_count("People", len(store.people))

    # Preserve selection after save
    if 'person_select_pending' in st.session_state:
        st.session_state['person_select'] = st.session_state.pop('person_select_pending')

    # Search + dropdown on the page, table below inside an expander
    col_search, col_select = st.columns([2, 1])
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
        sel = st.selectbox("Select", options=filtered_options, format_func=_format_person, key="person_select")

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

    # Editor form (create or update)
    with st.form("form_edit_person"):
        p = store.people.get(sel)
        first = st.text_input("First Name *", value=p.first_name if p else "")
        last = st.text_input("Last Name *", value=p.last_name if p else "")
        submitted = st.form_submit_button("Save Changes")
        if submitted and p:
            if first and last:
                p.first_name = first
                p.last_name = last
                _save_store(store)
                st.success("Changes saved.")
                # Preserve current selection
                st.session_state['person_select_pending'] = sel
                st.rerun()
            else:
                st.error("First and Last are required.")
    st.info("Create new people via the 🧭 Quick Entry tab.")
    # Employment managed separately in the Employment section.



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
    col_search, col_select = st.columns([2, 1])
    with col_search:
        search = st.text_input("Search teams", key="team_search").strip().lower()
    teams_all = list(store.teams.values())
    if org_filter and org_filter != ALL_ORGS:
        teams_all = [t for t in teams_all if t.org_id == org_filter]
    teams = teams_all
    if search:
        teams = [t for t in teams_all if search in (t.team_name or '').lower()]
    filtered_options = [t.team_id for t in sorted(teams, key=lambda x: (x.team_name or '').lower())]
    def _format_team(opt: str) -> str:
        t = store.teams.get(opt)
        return f"{t.team_name} (id: {opt[:8]}…)" if t else opt
    with col_select:
        sel = st.selectbox("Select", options=filtered_options, format_func=_format_team, key="team_select")

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

    # Editor form (create or update)
    with st.form("form_edit_team"):
        t = store.teams.get(sel)
        name = st.text_input("Team Name *", value=t.team_name if t else "")
        orgs_map = {o.org_id: o.name for o in store.organizations.values()}
        org_opts = list(orgs_map.keys())
        org_idx = org_opts.index(t.org_id) if (t and t.org_id in org_opts) else 0 if org_opts else 0
        org_id = st.selectbox("Organization *", options=org_opts, index=org_idx if org_opts else 0, format_func=lambda x: orgs_map[x]) if orgs_map else None
        desc = st.text_area("Description", value=t.description if t and t.description else "")
        submitted = st.form_submit_button("Save Changes")
        if submitted and t:
            if name and org_id:
                t.team_name = name
                t.org_id = org_id
                t.description = desc or None
                _save_store(store)
                st.success("Changes saved.")
                # Preserve current selection
                st.session_state['team_select_pending'] = sel
                st.rerun()
            else:
                st.error("Team Name and Organization are required.")
    st.info("Create new teams via the 🧭 Quick Entry tab.")


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

    # Search + dropdown on same line, table below inside an expander
    with st.expander("📋 Employment Table", expanded=True):
        col_search, col_select = st.columns([2, 1])
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
        # Dropdown filters by person (edit employment for selected person)
        # Include Add New to create employment for a person
        people_filtered = {e.person_id for e in emps}
        options = ["__new__"] + sorted(list(people_filtered), key=lambda pid: (store.people.get(pid).last_name + store.people.get(pid).first_name) if store.people.get(pid) else pid)
        def _fmt_person(pid: str) -> str:
            if pid == "__new__":
                return "➕ Add New Employment"
            p = store.people.get(pid)
            return f"{p.first_name} {p.last_name}" if p else pid
        with col_select:
            sel_person_id = st.selectbox("Select", options=options, format_func=_fmt_person, key="emp_select")

        # Table under the search + dropdown
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
                "Office": off.office_name if off else e.office_id,
                "DBA": dba_row.get("name") if dba_row else (off.office_name if off else ''),
                "Email": e.email or '',
                "Phone": e.phone or '',
                "Address": _address_to_str(addr),
            })
        if rows:
            st.dataframe(rows, use_container_width=True, hide_index=True)
        else:
            st.info("No results.")

    # Editor form (create or update)
    with st.form("form_edit_employment"):
        # Person selection
        if sel_person_id == "__new__":
            # Choose a person for whom to create employment
            people_opts = sorted(list(store.people.values()), key=lambda p: (p.last_name + p.first_name))
            person_id = st.selectbox("Person *", options=[p.person_id for p in people_opts], format_func=lambda x: f"{store.people[x].first_name} {store.people[x].last_name}") if people_opts else None
            # Employment fields
            orgs_map = {o.org_id: f"{o.name} [{o.org_type}]" for o in store.organizations.values()}
            org_id = st.selectbox("Organization *", options=list(orgs_map.keys()), format_func=lambda x: orgs_map[x]) if orgs_map else None
            office_map = {o.office_id: o.office_name for o in store.offices.values() if (org_id and o.org_id == org_id)}
            office_id = st.selectbox("Office *", options=list(office_map.keys()), format_func=lambda x: office_map[x]) if office_map else None
            email = st.text_input("Employment Email")
            phone = st.text_input("Employment Phone")
            active = st.checkbox("Active", value=True)
            # DBA select or create
            dba_options = [did for did, row in store.dba_names.items() if row.get("org_id") == org_id] if org_id else []
            dba_sel = st.selectbox("DBA", options=[""] + dba_options, format_func=lambda x: (store.dba_names[x]["name"] if x else "— Select existing or add new —"))
            new_dba_name = st.text_input("Or add new DBA")
            # Address select or create
            addr_options = [aid for aid, row in store.org_addresses.items() if row.get("org_id") == org_id] if org_id else []
            addr_sel = st.selectbox("Override Address", options=[""] + addr_options, format_func=lambda x: _address_to_str(store.org_addresses[x]["address"]) if x else "— Select existing or add new —")
            st.caption("Or add a new override address")
            ov_l1 = st.text_input("Line1", key="emp2_l1")
            ov_l2 = st.text_input("Line2", key="emp2_l2")
            ov_city = st.text_input("City", key="emp2_city")
            ov_state = st.text_input("State", key="emp2_state")
            ov_postal = st.text_input("Postal Code", key="emp2_postal")
            # Teams
            teams_map = {t.team_id: t.team_name for t in store.teams.values() if (org_id and (t.org_id == org_id))}
            selected_team = st.selectbox("Team", options=[""] + list(teams_map.keys()), format_func=lambda x: teams_map.get(x, "— None —") if x else "— None —")
            submitted = st.form_submit_button("Create Employment")
            if submitted:
                if person_id and org_id and office_id:
                    # Single active employment per person: deactivate any existing active
                    for e in store.employments.values():
                        if e.person_id == person_id and e.active:
                            e.active = False
                    # Resolve DBA and address IDs
                    dba_id = None
                    if dba_sel:
                        dba_id = dba_sel
                    elif new_dba_name:
                        dba_id, _ = _find_or_create_dba(store, org_id, new_dba_name)
                    addr_id = None
                    if addr_sel:
                        addr_id = addr_sel
                    elif ov_l1 or ov_l2 or ov_city or ov_state or ov_postal:
                        addr_id, _ = _find_or_create_org_address(store, org_id, Address(line1=ov_l1 or "", line2=ov_l2 or None, city=ov_city or "", state=ov_state or "", postal_code=ov_postal or ""))
                    emp_id = _new_id()
                    store.employments[emp_id] = Employment(employment_id=emp_id, person_id=person_id, org_id=org_id, office_id=office_id, email=email or None, phone=phone or None, active=active, override_dba_id=dba_id, override_address_id=addr_id)
                    # Team memberships: activate selected; deactivate others in this org
                    existing = {tm_id: tm for tm_id, tm in list(store.team_memberships.items()) if tm.person_id == person_id}
                    # deactivate all memberships not equal to selected_team
                    for tm in existing.values():
                        tm.active = (tm.team_id == selected_team) if selected_team else False
                    # activate or create selected
                    if selected_team:
                        m = next((tm for tm in existing.values() if tm.team_id == selected_team), None)
                        if m:
                            m.active = True
                        else:
                            tm_id = _new_id()
                            store.team_memberships[tm_id] = TeamMembership(team_membership_id=tm_id, team_id=selected_team, person_id=person_id, active=True)
                    _save_store(store)
                    st.success("Employment created.")
                    st.rerun()
                else:
                    st.error("Person, Organization, and Office are required.")
        else:
            # Edit existing active employment for selected person (or create if none)
            p = store.people.get(sel_person_id)
            st.write(f"Editing employment for: {p.first_name if p else ''} {p.last_name if p else ''}")
            active_emp = next((e for e in store.employments.values() if e.person_id == sel_person_id and e.active), None)
            orgs_map = {o.org_id: f"{o.name} [{o.org_type}]" for o in store.organizations.values()}
            org_opts = list(orgs_map.keys())
            org_idx = org_opts.index(active_emp.org_id) if (active_emp and active_emp.org_id in org_opts) else 0 if org_opts else 0
            org_id = st.selectbox("Organization *", options=org_opts, index=org_idx if org_opts else 0, format_func=lambda x: orgs_map[x]) if orgs_map else None
            office_map = {o.office_id: o.office_name for o in store.offices.values() if (org_id and o.org_id == org_id)}
            office_opts = list(office_map.keys())
            office_idx = office_opts.index(active_emp.office_id) if (active_emp and active_emp.office_id in office_opts) else 0 if office_opts else 0
            office_id = st.selectbox("Office *", options=office_opts, index=office_idx if office_opts else 0, format_func=lambda x: office_map[x]) if office_map else None
            email = st.text_input("Employment Email", value=active_emp.email if active_emp and active_emp.email else "")
            phone = st.text_input("Employment Phone", value=active_emp.phone if active_emp and active_emp.phone else "")
            active_flag = st.checkbox("Active", value=True if active_emp else True)
            # DBA
            dba_options = [did for did, row in store.dba_names.items() if row.get("org_id") == org_id] if org_id else []
            current_dba_id = active_emp.override_dba_id if active_emp else ""
            dba_idx = ([""] + dba_options).index(current_dba_id) if (current_dba_id in dba_options) else 0
            dba_sel = st.selectbox("DBA", options=[""] + dba_options, index=dba_idx, format_func=lambda x: (store.dba_names[x]["name"] if x else "— Select existing or add new —"))
            new_dba_name = st.text_input("Or add new DBA", value="")
            # Address
            addr_options = [aid for aid, row in store.org_addresses.items() if row.get("org_id") == org_id] if org_id else []
            current_addr_id = active_emp.override_address_id if active_emp else ""
            addr_idx = ([""] + addr_options).index(current_addr_id) if (current_addr_id in addr_options) else 0
            addr_sel = st.selectbox("Override Address", options=[""] + addr_options, index=addr_idx, format_func=lambda x: _address_to_str(store.org_addresses[x]["address"]) if x else "— Select existing or add new —")
            st.caption("Or add a new override address")
            ov_l1 = st.text_input("Line1", key="emp_edit_l1")
            ov_l2 = st.text_input("Line2", key="emp_edit_l2")
            ov_city = st.text_input("City", key="emp_edit_city")
            ov_state = st.text_input("State", key="emp_edit_state")
            ov_postal = st.text_input("Postal Code", key="emp_edit_postal")
            # Teams
            teams_map = {t.team_id: t.team_name for t in store.teams.values() if (org_id and (t.org_id == org_id))}
            current_team = next((tm.team_id for tm in store.team_memberships.values() if tm.person_id == sel_person_id and tm.active), "")
            selected_team = st.selectbox("Team", options=[""] + list(teams_map.keys()), index=([""] + list(teams_map.keys())).index(current_team) if current_team in teams_map else 0, format_func=lambda x: teams_map.get(x, "— None —") if x else "— None —")
            submitted = st.form_submit_button("Save Changes")
            if submitted and p:
                if org_id and office_id:
                    # single active employment
                    if active_emp:
                        e = active_emp
                        e.org_id = org_id
                        e.office_id = office_id
                        e.email = email or None
                        e.phone = phone or None
                        e.active = active_flag
                    else:
                        # create
                        new_id = _new_id()
                        store.employments[new_id] = Employment(employment_id=new_id, person_id=sel_person_id, org_id=org_id, office_id=office_id, email=email or None, phone=phone or None, active=active_flag)
                        e = store.employments[new_id]
                    # DBA/address
                    if dba_sel:
                        e.override_dba_id = dba_sel
                    elif new_dba_name:
                        e.override_dba_id = _find_or_create_dba(store, org_id, new_dba_name)[0]
                    if addr_sel:
                        e.override_address_id = addr_sel
                    elif ov_l1 or ov_l2 or ov_city or ov_state or ov_postal:
                        e.override_address_id = _find_or_create_org_address(store, org_id, Address(line1=ov_l1 or "", line2=ov_l2 or None, city=ov_city or "", state=ov_state or "", postal_code=ov_postal or ""))[0]
                    # Deactivate any other active employments for this person
                    for other_id, other in store.employments.items():
                        if other.person_id == sel_person_id and other is not e:
                            other.active = False
                    # Sync teams
                    existing = {tm_id: tm for tm_id, tm in list(store.team_memberships.items()) if tm.person_id == sel_person_id}
                    for tm in existing.values():
                        tm.active = (tm.team_id == selected_team) if selected_team else False
                    if selected_team:
                        m = next((tm for tm in existing.values() if tm.team_id == selected_team), None)
                        if m:
                            m.active = True
                        else:
                            tm_id = _new_id()
                            store.team_memberships[tm_id] = TeamMembership(team_membership_id=tm_id, team_id=selected_team, person_id=sel_person_id, active=True)
                    _save_store(store)
                    st.success("Employment saved.")
                    st.rerun()
                else:
                    st.error("Organization and Office are required.")


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
        org_options = ["__new_org__"] + list(orgs_map.keys())
        def _fmt_org(opt: str) -> str:
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

    people_opts = sorted(list(store.people.values()), key=lambda p: (p.last_name + p.first_name))
    person_options = ["__new__"] + [p.person_id for p in people_opts]
    def _fmt_person(pid: str) -> str:
        if pid == "__new__":
            return "➕ Add New Person"
        p = store.people.get(pid)
        return f"{p.first_name} {p.last_name}"
    person_id_sel = st.selectbox("Person", options=person_options, format_func=_fmt_person, key="qe_person") if selected_org_id else None
    # Inline create person form (same pattern as organization)
    if selected_org_id and person_id_sel == "__new__":
        with st.form("qe_add_person", clear_on_submit=True):
            colf, coll = st.columns(2)
            with colf:
                first_name_new = st.text_input("First Name *", key="qe_first_new")
            with coll:
                last_name_new = st.text_input("Last Name *", key="qe_last_new")
            submitted_person = st.form_submit_button("Create Person")
            if submitted_person:
                if not (first_name_new and last_name_new):
                    st.error("First and Last are required.")
                else:
                    pid = _new_id()
                    store.people[pid] = Person(person_id=pid, first_name=first_name_new, last_name=last_name_new)
                    _save_store(store)
                    st.success("Person created. Selected above to continue.")
                    st.session_state["qe_person_pending"] = pid
                    st.rerun()

    # Office selection via Address: choose existing or Add New Address
    office_id = None
    office_address_id = None
    if selected_org_id:
        addr_options = [aid for aid, row in (store.org_addresses or {}).items() if row.get("org_id") == selected_org_id]
        addr_label_map = {aid: _address_to_str(store.org_addresses[aid]["address"]) for aid in addr_options}
        addr_select_options = ["__new_address__"] + addr_options
        def _fmt_addr(opt: str) -> str:
            if opt == "__new_address__":
                return "➕ Add New Address"
            return addr_label_map.get(opt, opt)
        sel_addr = st.selectbox("Office Address *", options=addr_select_options, format_func=_fmt_addr, key="qe_office_addr")
        if sel_addr == "__new_address__":
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
        else:
            office_address_id = sel_addr
            # If office already exists for this address, set it
            existing_off = next((o for o in store.offices.values() if o.org_id == selected_org_id and o.default_address_id == sel_addr), None)
            if existing_off:
                office_id = existing_off.office_id
            # Removed preview caption under Office Address per request

    # Team selection directly after Office Address
    sel_team = ""
    selected_team = ""
    if selected_org_id:
        teams_for_org = [t for t in store.teams.values() if t.org_id == selected_org_id]
        team_label_map = {t.team_id: t.team_name for t in teams_for_org}
        team_select_options = ["__new_team__", "__default_city__"] + list(team_label_map.keys())
        def _fmt_team_option(opt: str) -> str:
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
        elif sel_team not in ("__new_team__", "__default_city__"):
            selected_team = sel_team

        # DBA dropdown directly under Team (outside Employment form)
        sel_dba = ""
        selected_dba_id = None
        dba_name_new = ""
        if selected_org_id:
            dba_options = [did for did, row in (store.dba_names or {}).items() if row.get("org_id") == selected_org_id]
            dba_label_map = {did: store.dba_names[did]["name"] for did in dba_options}
            dba_select_options = ["__new_dba__"] + dba_options
            def _fmt_dba(opt: str) -> str:
                if opt == "__new_dba__":
                    return "➕ Add New DBA"
                return dba_label_map.get(opt, opt)
            sel_dba = st.selectbox("DBA", options=dba_select_options, format_func=_fmt_dba, key="qe_dba")
            if sel_dba == "__new_dba__":
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
                            st.session_state["qe_dba_pending"] = dba_id
                            st.success("DBA created.")
                            st.rerun()
            else:
                selected_dba_id = sel_dba

    # Determine readiness for showing Employment contact + Save
    ready_for_save = bool(
        selected_org_id and person_id_sel and person_id_sel != "__new__"
        and ('sel_addr' in locals()) and (sel_addr and sel_addr != "__new_address__")
        and ('selected_team' in locals()) and selected_team
        and ('selected_dba_id' in locals()) and selected_dba_id
    )

    # Track selection signature to control locking of contact inputs and Save
    current_sig = f"{selected_org_id}|{person_id_sel}|{locals().get('sel_addr','')}|{locals().get('selected_team','')}|{locals().get('selected_dba_id','')}"
    if st.session_state.get('qe_lock_sig') != current_sig:
        st.session_state['qe_contact_locked'] = False
        st.session_state['qe_lock_sig'] = current_sig

    if ready_for_save:
        with st.form("form_quick_entry"):
            # Person must be a real selection; new person is created via the inline form above
            first = st.session_state.get("qe_first") if person_id_sel == "__new__" else None
            last = st.session_state.get("qe_last") if person_id_sel == "__new__" else None

            # Employment contact (only show after all preceding dropdowns are selected)
            email = ""
            phone = ""
            show_contact = bool(
                selected_org_id
                and person_id_sel and person_id_sel != "__new__"
                and ('sel_addr' in locals())
                and (sel_addr == "__new_address__" or sel_addr)
                and ('sel_team' in locals()) and sel_team
                and ('sel_dba' in locals()) and sel_dba
            )
            if show_contact:
                colE1, colE2 = st.columns(2)
                with colE1:
                    email = st.text_input("Email", key="qe_email", disabled=st.session_state.get('qe_contact_locked', False))
                with colE2:
                    phone = st.text_input("Phone", key="qe_phone", disabled=st.session_state.get('qe_contact_locked', False))

            # Team selection handled above after Office Address

            # DBA handled above under Team

            # Active flag at the bottom (less disruptive)
            active = st.checkbox("Active employment", value=True, key="qe_active", disabled=st.session_state.get('qe_contact_locked', False))

            # Always include a submit button in the form to satisfy Streamlit
            if st.session_state.get('qe_contact_locked', False):
                col_edit, col_save = st.columns([1, 2])
                with col_edit:
                    edit_clicked = st.form_submit_button("Edit Employment")
                with col_save:
                    submitted = st.form_submit_button("Save", disabled=True)
                if edit_clicked:
                    st.session_state['qe_contact_locked'] = False
                    st.rerun()
            else:
                submitted = st.form_submit_button("Save")
        if ready_for_save and submitted:
            if person_id_sel == "__new__":
                st.error("Please create and select a person first.")
                return
            if not selected_org_id:
                st.error("Organization is required.")
                return
            # Resolve person id (create if new)
            person_id = person_id_sel

            # Resolve Office from selected or new address
            final_office_id = office_id
            if not final_office_id:
                # Need an address to bind an office
                addr_to_use = office_address_id
                if 'sel_addr' in locals() and sel_addr == "__new_address__":
                    if not (('off_l1' in locals() and off_l1) or ('off_city' in locals() and off_city) or ('off_state' in locals() and off_state) or ('off_postal' in locals() and off_postal)):
                        st.error("Please enter the new office address (Line1/City/State/Postal).")
                        return
                    addr_to_use, _ = _find_or_create_org_address(
                        store,
                        selected_org_id,
                        Address(line1=off_l1 or "", line2=off_l2 or None, city=off_city or "", state=off_state or "", postal_code=off_postal or "")
                    )
                if not addr_to_use:
                    st.error("Please select or add an office address.")
                    return
                # Find or create office for this address
                exist_off = next((o for o in store.offices.values() if o.org_id == selected_org_id and o.default_address_id == addr_to_use), None)
                if exist_off:
                    final_office_id = exist_off.office_id
                else:
                    org = store.organizations.get(selected_org_id)
                    addr_obj = store.org_addresses.get(addr_to_use, {}).get("address")
                    office_name_auto = f"{org.name} - {addr_obj.line1} - {addr_obj.city}" if (org and addr_obj and addr_obj.line1) else (f"{org.name} - {addr_obj.city}" if (org and addr_obj) else (org.name if org else "Office"))
                    new_oid = _new_id()
                    store.offices[new_oid] = Office(office_id=new_oid, org_id=selected_org_id, office_name=office_name_auto, default_address_id=addr_to_use)
                    final_office_id = new_oid
                    _save_store(store)
                    st.session_state["qe_office_pending"] = new_oid

            # If adding a team inline or default-by-city, resolve it now and set selected_team
            if selected_org_id and sel_team in ("__new_team__", "__default_city__"):
                if sel_team == "__new_team__":
                    if team_name_new:
                        name_norm = _normalize_text(team_name_new)
                        dup = next((t for t in store.teams.values() if (t.org_id == selected_org_id and _normalize_text(t.team_name) == name_norm)), None)
                        if dup:
                            selected_team = dup.team_id
                        else:
                            tid = _new_id()
                            store.teams[tid] = Team(team_id=tid, team_name=team_name_new, org_id=selected_org_id, description=team_desc_new or None)
                            _save_store(store)
                            selected_team = tid
                            st.session_state["qe_team_pending"] = tid
                    else:
                        selected_team = ""
                else:  # __default_city__
                    # Derive city from selected or new office address
                    city_val = None
                    if 'sel_addr' in locals() and sel_addr != "__new_address__":
                        addr_obj = store.org_addresses.get(sel_addr, {}).get("address")
                        city_val = addr_obj.city if addr_obj else None
                    else:
                        city_val = (off_city if 'off_city' in locals() else None)
                    if not city_val:
                        st.error("Cannot use default team name without a city. Please select or add an office address with a city.")
                        return
                    org = store.organizations.get(selected_org_id)
                    auto_team_name = f"{org.name} - {city_val}" if org else city_val
                    name_norm = _normalize_text(auto_team_name)
                    dup = next((t for t in store.teams.values() if (t.org_id == selected_org_id and _normalize_text(t.team_name) == name_norm)), None)
                    if dup:
                        selected_team = dup.team_id
                    else:
                        tid = _new_id()
                        store.teams[tid] = Team(team_id=tid, team_name=auto_team_name, org_id=selected_org_id, description=None)
                        _save_store(store)
                        selected_team = tid
                        st.session_state["qe_team_pending"] = tid

            # Single active employment per person: deactivate others
            for e in store.employments.values():
                if e.person_id == person_id and e.active:
                    e.active = False

            # Resolve DBA from dropdown
            dba_id = None
            if sel_dba == "__new_dba__":
                if dba_name_new:
                    name_norm = _normalize_text(dba_name_new)
                    dup = next((did for did, row in (store.dba_names or {}).items() if row.get("org_id") == selected_org_id and _normalize_text(row.get("name","")) == name_norm), None)
                    dba_id = dup if dup else _find_or_create_dba(store, selected_org_id, dba_name_new)[0]
                    if dba_id:
                        st.session_state["qe_dba_pending"] = dba_id
                else:
                    dba_id = None
            else:
                dba_id = selected_dba_id

            # No employment override address selection; use office default
            addr_id = None

            # Create active employment
            emp_id = _new_id()
            store.employments[emp_id] = Employment(
                employment_id=emp_id,
                person_id=person_id,
                org_id=selected_org_id,
                office_id=final_office_id,
                email=email or None,
                phone=phone or None,
                active=active,
                override_dba_id=dba_id,
                override_address_id=addr_id,
            )

            # Sync teams
            existing = {tm_id: tm for tm_id, tm in list(store.team_memberships.items()) if tm.person_id == person_id}
            for tm in existing.values():
                tm.active = (tm.team_id == selected_team) if selected_team else False
            if selected_team:
                m = next((tm for tm in existing.values() if tm.team_id == selected_team), None)
                if m:
                    m.active = True
                else:
                    tm_id = _new_id()
                    store.team_memberships[tm_id] = TeamMembership(team_membership_id=tm_id, team_id=selected_team, person_id=person_id, active=True)

            _save_store(store)
            st.success("Saved person + employment.")
            # Lock contact inputs to prevent duplicate submission for the same selection set
            st.session_state['qe_contact_locked'] = True
            st.session_state['qe_lock_sig'] = current_sig
            st.rerun()

    # (Removed) separate bottom team creation expander to avoid duplicates and nested forms

def _resolved_addresses_section():
    store = _ensure_store()
    st.subheader("Resolved Addresses (Employment override > Office default)")

    rows = []
    for e in store.employments.values():
        if not e.active:
            continue
        p = store.people.get(e.person_id)
        off = store.offices.get(e.office_id)
        org = store.organizations.get(e.org_id)
        # Resolve DBA and Address
        dba_row = store.dba_names.get(e.override_dba_id)
        dba = dba_row.get("name") if dba_row else (off.office_name if off else '')
        addr = store.org_addresses.get(e.override_address_id, {}).get("address") if e.override_address_id else (store.org_addresses.get(off.default_address_id, {}).get("address") if off else None)
        rows.append({
            "Person": f"{p.first_name if p else ''} {p.last_name if p else ''}".strip() or e.person_id,
            "Organization": org.name if org else e.org_id,
            "DBA": dba,
            "Email": e.email or '',
            "Phone": e.phone or '',
            "Address": _address_to_str(addr),
        })
    if rows:
        st.dataframe(rows, use_container_width=True, hide_index=True)
    else:
        st.info("No broker-office assignments yet.")


def render():
    """Render the alternate Brokers prototype page."""
    st.title("🏗️ People/Organizations Prototype (Alt)")
    st.caption("Experimental model: Organization → Offices; People with single active Employment; Teams by Organization.")

    # Disable browser autofill behaviors for this page
    _disable_autofill()

    col_seed, col_export = st.columns([1, 1])
    with col_seed:
        if st.button("Seed Sample Data", help="Populate example organization, offices, team, and people"):
            _seed_sample_data()
    with col_export:
        if st.button("Save Snapshot", help="Write current store to JSON under fixtures/"):
            _save_store(_ensure_store())
            st.success(f"Saved to {DATA_PATH}")

    st.divider()

    tab0, tab1, tab2, tab3, tab4, tab5, tab6 = st.tabs([
        "🧭 Quick Entry", "🏢 Organizations", "🏬 Offices", "👤 People", "💼 Employment", "👥 Teams", "📍 Resolved Addresses",
    ])

    with tab0:
        _quick_entry_section()

    with tab1:
        _organizations_section()
    with tab2:
        _offices_section()
    with tab3:
        _people_section()
    with tab4:
        _employment_section()
    with tab5:
        _teams_section()
    with tab6:
        _resolved_addresses_section()
