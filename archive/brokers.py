"""
Brokers Page Module
==================
Broker management functionality for the main app
"""

import os
import psycopg2
import streamlit as st
import pandas as pd
from datetime import datetime
from typing import List, Dict, Optional

DATABASE_URL = os.getenv("DATABASE_URL")

def get_db_connection():
    """Get database connection"""
    try:
        return psycopg2.connect(DATABASE_URL)
    except Exception as e:
        st.error(f"Database connection failed: {str(e)}")
        return None

def load_brokers() -> List[Dict]:
    """Load all brokers with contact counts"""
    conn = get_db_connection()
    if not conn:
        return []
    
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT 
                    b.id, b.company_name, b.city, b.state, b.phone, b.website,
                    COUNT(bc.id) as contact_count,
                    b.created_at
                FROM brokers b
                LEFT JOIN broker_contacts bc ON b.id = bc.broker_id
                GROUP BY b.id, b.company_name, b.city, b.state, b.phone, b.website, b.created_at
                ORDER BY b.company_name
            """)
            
            columns = [desc[0] for desc in cur.description]
            return [dict(zip(columns, row)) for row in cur.fetchall()]
    except Exception as e:
        st.error(f"Error loading brokers: {str(e)}")
        return []
    finally:
        conn.close()

def load_broker_contacts(broker_id: str) -> List[Dict]:
    """Load contacts for a specific broker"""
    conn = get_db_connection()
    if not conn:
        return []
    
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, first_name, last_name, email, phone, title, is_primary
                FROM broker_contacts
                WHERE broker_id = %s
                ORDER BY is_primary DESC, last_name, first_name
            """, (broker_id,))
            
            columns = [desc[0] for desc in cur.description]
            return [dict(zip(columns, row)) for row in cur.fetchall()]
    except Exception as e:
        st.error(f"Error loading contacts: {str(e)}")
        return []
    finally:
        conn.close()

def create_broker(company_name: str, address: str, city: str, state: str, 
                 zip_code: str, phone: str, website: str, notes: str) -> Optional[str]:
    """Create a new broker"""
    conn = get_db_connection()
    if not conn:
        return None
    
    try:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO brokers (company_name, address, city, state, zip_code, phone, website, notes)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (company_name, address, city, state, zip_code, phone, website, notes))
            
            broker_id = cur.fetchone()[0]
            conn.commit()
            return broker_id
    except Exception as e:
        st.error(f"Error creating broker: {str(e)}")
        conn.rollback()
        return None
    finally:
        conn.close()

def create_broker_contact(broker_id: str, first_name: str, last_name: str, 
                         email: str, phone: str, title: str, is_primary: bool) -> bool:
    """Create a new broker contact"""
    conn = get_db_connection()
    if not conn:
        return False
    
    try:
        with conn.cursor() as cur:
            # If this is primary, unset others first
            if is_primary:
                cur.execute("""
                    UPDATE broker_contacts 
                    SET is_primary = FALSE 
                    WHERE broker_id = %s
                """, (broker_id,))
            
            cur.execute("""
                INSERT INTO broker_contacts (broker_id, first_name, last_name, email, phone, title, is_primary)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
            """, (broker_id, first_name, last_name, email, phone, title, is_primary))
            
            conn.commit()
            return True
    except Exception as e:
        st.error(f"Error creating contact: {str(e)}")
        conn.rollback()
        return False
    finally:
        conn.close()

def update_broker(broker_id: str, company_name: str, address: str, city: str, 
                 state: str, zip_code: str, phone: str, website: str, notes: str) -> bool:
    """Update broker information"""
    conn = get_db_connection()
    if not conn:
        return False
    
    try:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE brokers 
                SET company_name = %s, address = %s, city = %s, state = %s, 
                    zip_code = %s, phone = %s, website = %s, notes = %s,
                    updated_at = now()
                WHERE id = %s
            """, (company_name, address, city, state, zip_code, phone, website, notes, broker_id))
            
            conn.commit()
            return True
    except Exception as e:
        st.error(f"Error updating broker: {str(e)}")
        conn.rollback()
        return False
    finally:
        conn.close()

def delete_broker_contact(contact_id: str) -> bool:
    """Delete a broker contact"""
    conn = get_db_connection()
    if not conn:
        return False
    
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM broker_contacts WHERE id = %s", (contact_id,))
            conn.commit()
            return True
    except Exception as e:
        st.error(f"Error deleting contact: {str(e)}")
        conn.rollback()
        return False
    finally:
        conn.close()

# ============ COMPANY MANAGEMENT FUNCTIONS ============

def load_broker_companies() -> List[Dict]:
    """Load all broker companies with location and contact counts"""
    conn = get_db_connection()
    if not conn:
        return []
    
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT 
                    bc.id, bc.company_name, bc.primary_website, bc.primary_phone,
                    COUNT(DISTINCT bl.id) as location_count,
                    COUNT(DISTINCT bct.id) as contact_count,
                    COUNT(DISTINCT s.id) as submission_count,
                    bc.created_at
                FROM broker_companies bc
                LEFT JOIN broker_locations bl ON bc.id = bl.company_id
                LEFT JOIN broker_contacts_new bct ON bc.id = bct.company_id
                LEFT JOIN submissions s ON bc.id = s.broker_company_id
                GROUP BY bc.id, bc.company_name, bc.primary_website, bc.primary_phone, bc.created_at
                ORDER BY bc.company_name
            """)
            
            columns = [desc[0] for desc in cur.description]
            return [dict(zip(columns, row)) for row in cur.fetchall()]
    except Exception as e:
        st.error(f"Error loading companies: {str(e)}")
        return []
    finally:
        conn.close()

def load_company_locations(company_id: str) -> List[Dict]:
    """Load locations for a specific company"""
    conn = get_db_connection()
    if not conn:
        return []
    
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, location_name, address, city, state, zip_code, 
                       phone, is_headquarters, location_notes
                FROM broker_locations
                WHERE company_id = %s
                ORDER BY is_headquarters DESC, location_name
            """, (company_id,))
            
            columns = [desc[0] for desc in cur.description]
            return [dict(zip(columns, row)) for row in cur.fetchall()]
    except Exception as e:
        st.error(f"Error loading locations: {str(e)}")
        return []
    finally:
        conn.close()

def load_company_contacts(company_id: str) -> List[Dict]:
    """Load contacts for a specific company"""
    conn = get_db_connection()
    if not conn:
        return []
    
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT bct.id, bct.first_name, bct.last_name, bct.email, bct.phone, 
                       bct.title, bct.is_primary, bct.is_location_primary,
                       bl.location_name
                FROM broker_contacts_new bct
                LEFT JOIN broker_locations bl ON bct.location_id = bl.id
                WHERE bct.company_id = %s
                ORDER BY bct.is_primary DESC, bct.last_name, bct.first_name
            """, (company_id,))
            
            columns = [desc[0] for desc in cur.description]
            return [dict(zip(columns, row)) for row in cur.fetchall()]
    except Exception as e:
        st.error(f"Error loading contacts: {str(e)}")
        return []
    finally:
        conn.close()

def create_broker_company(company_name: str, primary_website: str, 
                         primary_phone: str, company_notes: str) -> Optional[str]:
    """Create a new broker company"""
    conn = get_db_connection()
    if not conn:
        return None
    
    try:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO broker_companies (company_name, primary_website, primary_phone, company_notes)
                VALUES (%s, %s, %s, %s)
                RETURNING id
            """, (company_name, primary_website, primary_phone, company_notes))
            
            company_id = cur.fetchone()[0]
            conn.commit()
            return company_id
    except psycopg2.IntegrityError as e:
        st.error(f"Company name already exists: {company_name}")
        conn.rollback()
        return None
    except Exception as e:
        st.error(f"Error creating company: {str(e)}")
        conn.rollback()
        return None
    finally:
        conn.close()

def create_broker_location(company_id: str, location_name: str, address: str, 
                          city: str, state: str, zip_code: str, phone: str, 
                          is_headquarters: bool, location_notes: str) -> bool:
    """Create a new broker location"""
    conn = get_db_connection()
    if not conn:
        return False
    
    try:
        with conn.cursor() as cur:
            # If this is headquarters, unset others first
            if is_headquarters:
                cur.execute("""
                    UPDATE broker_locations 
                    SET is_headquarters = FALSE 
                    WHERE company_id = %s
                """, (company_id,))
            
            cur.execute("""
                INSERT INTO broker_locations 
                (company_id, location_name, address, city, state, zip_code, phone, is_headquarters, location_notes)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (company_id, location_name, address, city, state, zip_code, phone, is_headquarters, location_notes))
            
            conn.commit()
            return True
    except Exception as e:
        st.error(f"Error creating location: {str(e)}")
        conn.rollback()
        return False
    finally:
        conn.close()

def create_company_contact(company_id: str, location_id: Optional[str], first_name: str, 
                         last_name: str, email: str, phone: str, title: str, 
                         is_primary: bool, is_location_primary: bool) -> bool:
    """Create a new company contact"""
    conn = get_db_connection()
    if not conn:
        return False
    
    try:
        with conn.cursor() as cur:
            # If this is primary, unset others first
            if is_primary:
                cur.execute("""
                    UPDATE broker_contacts_new 
                    SET is_primary = FALSE 
                    WHERE company_id = %s
                """, (company_id,))
            
            if is_location_primary and location_id:
                cur.execute("""
                    UPDATE broker_contacts_new 
                    SET is_location_primary = FALSE 
                    WHERE location_id = %s
                """, (location_id,))
            
            cur.execute("""
                INSERT INTO broker_contacts_new 
                (company_id, location_id, first_name, last_name, email, phone, title, is_primary, is_location_primary)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (company_id, location_id, first_name, last_name, email, phone, title, is_primary, is_location_primary))
            
            conn.commit()
            return True
    except Exception as e:
        st.error(f"Error creating contact: {str(e)}")
        conn.rollback()
        return False
    finally:
        conn.close()

def render_broker_list():
    """Render the main broker list"""
    st.subheader("🏢 Brokers")
    
    brokers = load_brokers()
    
    if not brokers:
        st.info("No brokers found. Add your first broker below.")
        return None
    
    # Convert to DataFrame for display
    df = pd.DataFrame(brokers)
    df['created_at'] = pd.to_datetime(df['created_at']).dt.strftime('%Y-%m-%d')
    
    # Display as a table
    st.dataframe(
        df,
        column_config={
            "id": None,  # Hide ID column
            "company_name": st.column_config.TextColumn("Company Name", width="large"),
            "city": st.column_config.TextColumn("City", width="medium"),
            "state": st.column_config.TextColumn("State", width="small"),
            "phone": st.column_config.TextColumn("Phone", width="medium"),
            "website": st.column_config.TextColumn("Website", width="medium"),
            "contact_count": st.column_config.NumberColumn("Contacts", width="small"),
            "created_at": st.column_config.DateColumn("Created", width="small"),
        },
        hide_index=True,
        use_container_width=True
    )
    
    return brokers

def render_broker_form(broker_data: Dict = None):
    """Render broker creation/edit form"""
    is_edit = broker_data is not None
    form_title = "Edit Broker" if is_edit else "Add New Broker"
    
    with st.form(f"broker_form_{broker_data.get('id', 'new') if is_edit else 'new'}"):
        st.subheader(form_title)
        
        col1, col2 = st.columns(2)
        
        with col1:
            company_name = st.text_input(
                "Company Name *", 
                value=broker_data.get('company_name', '') if is_edit else ''
            )
            address = st.text_input(
                "Address", 
                value=broker_data.get('address', '') if is_edit else ''
            )
            city = st.text_input(
                "City", 
                value=broker_data.get('city', '') if is_edit else ''
            )
            state = st.text_input(
                "State", 
                value=broker_data.get('state', '') if is_edit else ''
            )
        
        with col2:
            zip_code = st.text_input(
                "ZIP Code", 
                value=broker_data.get('zip_code', '') if is_edit else ''
            )
            phone = st.text_input(
                "Phone", 
                value=broker_data.get('phone', '') if is_edit else ''
            )
            website = st.text_input(
                "Website", 
                value=broker_data.get('website', '') if is_edit else ''
            )
        
        notes = st.text_area(
            "Notes", 
            value=broker_data.get('notes', '') if is_edit else ''
        )
        
        submitted = st.form_submit_button(f"{'Update' if is_edit else 'Create'} Broker")
        
        if submitted and company_name:
            if is_edit:
                success = update_broker(
                    broker_data['id'], company_name, address, city, 
                    state, zip_code, phone, website, notes
                )
                if success:
                    st.success("Broker updated successfully!")
                    st.rerun()
            else:
                broker_id = create_broker(
                    company_name, address, city, state, 
                    zip_code, phone, website, notes
                )
                if broker_id:
                    st.success("Broker created successfully!")
                    st.rerun()
        elif submitted and not company_name:
            st.error("Company name is required")

def render_contacts_section(broker_id: str, broker_name: str):
    """Render contacts section for a broker"""
    st.subheader(f"👥 Contacts for {broker_name}")
    
    contacts = load_broker_contacts(broker_id)
    
    # Display existing contacts
    if contacts:
        for contact in contacts:
            with st.container():
                col1, col2, col3, col4, col5 = st.columns([2, 2, 2, 1, 1])
                
                with col1:
                    name = f"{contact['first_name']} {contact['last_name']}"
                    if contact['is_primary']:
                        st.write(f"**{name}** ⭐")
                    else:
                        st.write(name)
                
                with col2:
                    st.write(contact['email'])
                
                with col3:
                    st.write(contact['title'] or '-')
                
                with col4:
                    st.write(contact['phone'] or '-')
                
                with col5:
                    if st.button("🗑️", key=f"del_{contact['id']}", help="Delete contact"):
                        if delete_broker_contact(contact['id']):
                            st.success("Contact deleted!")
                            st.rerun()
    else:
        st.info("No contacts added yet.")
    
    # Add new contact form
    with st.form(f"contact_form_{broker_id}"):
        st.write("**Add New Contact**")
        
        col1, col2, col3 = st.columns(3)
        
        with col1:
            first_name = st.text_input("First Name *")
            last_name = st.text_input("Last Name *")
        
        with col2:
            email = st.text_input("Email *")
            phone = st.text_input("Phone")
        
        with col3:
            title = st.text_input("Title")
            is_primary = st.checkbox("Primary Contact")
        
        submitted = st.form_submit_button("Add Contact")
        
        if submitted:
            if first_name and last_name and email:
                success = create_broker_contact(
                    broker_id, first_name, last_name, email, phone, title, is_primary
                )
                if success:
                    st.success("Contact added successfully!")
                    st.rerun()
            else:
                st.error("First name, last name, and email are required")

# ============ COMPANY UI FUNCTIONS ============

def render_company_list():
    """Render the company list with search and selection"""
    companies = load_broker_companies()
    
    if not companies:
        st.info("No companies found. Add your first company below.")
        return None, None
    
    # Search and company selection in same row
    col1, col2 = st.columns([2, 1])
    
    with col1:
        search_term = st.text_input("🔍 Search companies", key="search_companies", placeholder="Enter company name...")
        # Trigger rerun when search term changes
        if search_term != st.session_state.get("last_company_search_term", ""):
            st.session_state.last_company_search_term = search_term
            st.rerun()
    
    with col2:
        # Filter companies based on search
        if search_term:
            filtered_companies = [c for c in companies if search_term.lower() in c['company_name'].lower()]
        else:
            filtered_companies = companies
        
        # Company selection dropdown
        if filtered_companies:
            company_options = {company['id']: f"{company['company_name']} ({company['location_count']} locations, {company['contact_count']} contacts)" 
                              for company in filtered_companies}
            
            selected_company_id = st.selectbox(
                "Select company for detailed management:",
                options=list(company_options.keys()),
                format_func=lambda x: company_options[x],
                key="company_selector"
            )
        else:
            selected_company_id = None
            st.info("No companies match search")
    
    # Display filtered companies in expandable table (open by default)
    with st.expander("📊 Company Stats Table", expanded=True):
        # Prepare data for the table using filtered companies
        table_data = []
        for company in filtered_companies:
            table_data.append({
                "Company": company['company_name'],
                "Locations": company['location_count'],
                "Contacts": company['contact_count'],
                "Submissions": company['submission_count'],
                "Created": pd.to_datetime(company['created_at']).strftime('%Y-%m-%d')
            })
        
        if table_data:
            # Display as table
            df_table = pd.DataFrame(table_data)
            st.dataframe(
                df_table,
                use_container_width=True,
                hide_index=True
            )
        else:
            st.info("No companies to display")
    
    return companies, selected_company_id

def render_company_form(company_data: Dict = None):
    """Render company creation/edit form"""
    is_edit = company_data is not None
    form_title = "Edit Company" if is_edit else "Add New Company"
    
    with st.form(f"company_form_{company_data.get('id', 'new') if is_edit else 'new'}"):
        st.subheader(form_title)
        
        company_name = st.text_input(
            "Company Name *", 
            value=company_data.get('company_name', '') if is_edit else '',
            help="The main company name (e.g., 'ABC Insurance Services')"
        )
        
        company_notes = st.text_area(
            "Company Notes", 
            value=company_data.get('company_notes', '') if is_edit else '',
            help="General notes about the company"
        )
        
        submitted = st.form_submit_button(f"{'Update' if is_edit else 'Create'} Company")
        
        if submitted and company_name:
            if is_edit:
                st.success("Company updated successfully!")
                st.rerun()
            else:
                company_id = create_broker_company(
                    company_name, "", "", company_notes  # Empty strings for website and phone
                )
                if company_id:
                    st.success(f"Company '{company_name}' created successfully!")
                    st.rerun()
        elif submitted and not company_name:
            st.error("Company name is required")

def render_company_locations_section(company_id: str, company_name: str):
    """Render locations section for a company"""
    st.subheader(f"📍 Locations for {company_name}")
    
    locations = load_company_locations(company_id)
    
    # Display existing locations stacked vertically
    if locations:
        for location in locations:
            with st.container():
                # Location name and HQ status
                name = location['location_name'] or "Main Office"
                if location['is_headquarters']:
                    st.write(f"**📍 {name}** 🏢 HQ")
                else:
                    st.write(f"**📍 {name}**")
                
                # Address
                address_parts = [location['address'], location['city'], location['state'], location['zip_code']]
                address = ", ".join([p for p in address_parts if p])
                if address:
                    st.write(f"📍 {address}")
                
                # Phone
                if location['phone']:
                    st.write(f"📞 {location['phone']}")
                
                # Notes
                if location['location_notes']:
                    st.write(f"📝 {location['location_notes']}")
        
        if locations:  # Only show divider if there are locations
            st.divider()
    
    # Add new location form - stacked vertically
    with st.expander("➕ Add New Location"):
        with st.form(f"location_form_{company_id}"):
            location_name = st.text_input(
                "Location Name", 
                placeholder="Main Office, North East Branch, etc."
            )
            
            address = st.text_input("Address")
            
            col1, col2 = st.columns(2)
            with col1:
                city = st.text_input("City")
            with col2:
                state = st.text_input("State")
            
            col3, col4 = st.columns(2)
            with col3:
                zip_code = st.text_input("ZIP Code")
            with col4:
                phone = st.text_input("Phone")
            
            is_headquarters = st.checkbox("This is the headquarters")
            
            location_notes = st.text_area("Location Notes")
            
            submitted = st.form_submit_button("Add Location")
            
            if submitted:
                success = create_broker_location(
                    company_id, location_name, address, city, state, 
                    zip_code, phone, is_headquarters, location_notes
                )
                if success:
                    st.success("Location added successfully!")
                    st.rerun()

def render_company_contacts_section(company_id: str, company_name: str):
    """Render contacts section for a company"""
    st.subheader(f"👥 Contacts for {company_name}")
    
    contacts = load_company_contacts(company_id)
    locations = load_company_locations(company_id)
    
    # Display existing contacts stacked vertically
    if contacts:
        for contact in contacts:
            with st.container():
                # Contact name and badges
                name = f"{contact['first_name']} {contact['last_name']}"
                badges = []
                if contact['is_primary']:
                    badges.append("⭐ Primary")
                if contact['is_location_primary']:
                    badges.append("📍 Location Primary")
                
                if badges:
                    st.write(f"**👤 {name}** {' '.join(badges)}")
                else:
                    st.write(f"**👤 {name}**")
                
                # Email
                st.write(f"📧 {contact['email']}")
                
                # Phone
                if contact['phone']:
                    st.write(f"📞 {contact['phone']}")
                
                # Title and location
                details = []
                if contact['title']:
                    details.append(f"💼 {contact['title']}")
                if contact['location_name']:
                    details.append(f"📍 {contact['location_name']}")
                
                if details:
                    st.write(" • ".join(details))
        
        if contacts:  # Only show divider if there are contacts
            st.divider()
    
    # Add new contact form - stacked vertically
    with st.expander("➕ Add New Contact"):
        with st.form(f"contact_form_{company_id}"):
            col1, col2 = st.columns(2)
            with col1:
                first_name = st.text_input("First Name *")
            with col2:
                last_name = st.text_input("Last Name *")
            
            email = st.text_input("Email *")
            
            col3, col4 = st.columns(2)
            with col3:
                phone = st.text_input("Phone")
            with col4:
                title = st.text_input("Title")
            
            # Location assignment
            location_options = [""] + [f"{loc['id']}:{loc['location_name'] or 'Main Office'}" 
                                     for loc in locations]
            selected_location = st.selectbox(
                "Assign to Location (optional)",
                options=location_options,
                format_func=lambda x: x.split(':', 1)[1] if ':' in x else "No specific location"
            )
            
            col5, col6 = st.columns(2)
            with col5:
                is_primary = st.checkbox("Primary contact for company")
            with col6:
                is_location_primary = st.checkbox("Primary contact for location") if selected_location else False
            
            submitted = st.form_submit_button("Add Contact")
            
            if submitted:
                if first_name and last_name and email:
                    location_id = selected_location.split(':', 1)[0] if selected_location and ':' in selected_location else None
                    success = create_company_contact(
                        company_id, location_id, first_name, last_name, email, 
                        phone, title, is_primary, is_location_primary
                    )
                    if success:
                        st.success("Contact added successfully!")
                        st.rerun()
                else:
                    st.error("First name, last name, and email are required")

def render():
    """Main render function for the brokers page"""
    st.title("🏢 Broker Management")
    
    # Navigation tabs - Company List and Add Company between Broker List and Add Broker
    tab1, tab2, tab3, tab4 = st.tabs(["📋 Brokers List", "🏢 Company List", "➕ Add Company", "➕ Add Broker"])
    
    with tab1:
        brokers = render_broker_list()
        
        # If brokers exist, allow selection for detailed view
        if brokers:
            st.divider()
            
            # Broker selection for detailed management
            broker_options = {broker['id']: f"{broker['company_name']} ({broker['city']}, {broker['state']})" 
                            for broker in brokers}
            
            selected_broker_id = st.selectbox(
                "Select broker for detailed management:",
                options=list(broker_options.keys()),
                format_func=lambda x: broker_options[x],
                key="broker_selector"
            )
            
            if selected_broker_id:
                selected_broker = next(b for b in brokers if b['id'] == selected_broker_id)
                
                # Show broker details and contacts
                col1, col2 = st.columns([1, 1])
                
                with col1:
                    st.subheader("📝 Broker Details")
                    render_broker_form(selected_broker)
                
                with col2:
                    render_contacts_section(selected_broker_id, selected_broker['company_name'])
    
    with tab2:
        companies, selected_company_id = render_company_list()
        
        # If a company is selected, show detailed management
        if companies and selected_company_id:
            selected_company = next(c for c in companies if c['id'] == selected_company_id)
            
            # Stack everything vertically instead of 3 columns
            render_company_form(selected_company)
            
            render_company_locations_section(selected_company_id, selected_company['company_name'])
            
            st.divider()
            render_company_contacts_section(selected_company_id, selected_company['company_name'])
    
    with tab3:
        render_company_form()
    
    with tab4:
        render_broker_form()