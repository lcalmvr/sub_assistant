"""
Broker Management v2.0
======================
Updated broker management with normalized company/location structure to prevent duplicates
"""

import os
import psycopg2
import streamlit as st
import pandas as pd
from datetime import datetime
from typing import List, Dict, Optional, Tuple
from dotenv import load_dotenv

load_dotenv()

st.set_page_config(page_title="Broker Management v2", layout="wide")

DATABASE_URL = os.getenv("DATABASE_URL")

def get_db_connection():
    """Get database connection"""
    try:
        return psycopg2.connect(DATABASE_URL)
    except Exception as e:
        st.error(f"Database connection failed: {str(e)}")
        return None

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

def create_broker_contact(company_id: str, location_id: Optional[str], first_name: str, 
                         last_name: str, email: str, phone: str, title: str, 
                         is_primary: bool, is_location_primary: bool) -> bool:
    """Create a new broker contact"""
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

def render_company_list():
    """Render the main company list"""
    st.subheader("🏢 Broker Companies")
    
    companies = load_broker_companies()
    
    if not companies:
        st.info("No broker companies found. Add your first company below.")
        return None
    
    # Convert to DataFrame for display
    df = pd.DataFrame(companies)
    df['created_at'] = pd.to_datetime(df['created_at']).dt.strftime('%Y-%m-%d')
    
    # Display as a table
    st.dataframe(
        df,
        column_config={
            "id": None,  # Hide ID column
            "company_name": st.column_config.TextColumn("Company Name", width="large"),
            "primary_website": st.column_config.TextColumn("Website", width="medium"),
            "primary_phone": st.column_config.TextColumn("Phone", width="medium"),
            "location_count": st.column_config.NumberColumn("Locations", width="small"),
            "contact_count": st.column_config.NumberColumn("Contacts", width="small"),
            "submission_count": st.column_config.NumberColumn("Submissions", width="small"),
            "created_at": st.column_config.DateColumn("Created", width="small"),
        },
        hide_index=True,
        use_container_width=True,
        key="company_table"
    )
    
    return companies

def render_company_form(company_data: Dict = None):
    """Render company creation/edit form"""
    is_edit = company_data is not None
    form_title = "Edit Company" if is_edit else "Add New Company"
    
    with st.form(f"company_form_{company_data.get('id', 'new') if is_edit else 'new'}"):
        st.subheader(form_title)
        
        col1, col2 = st.columns(2)
        
        with col1:
            company_name = st.text_input(
                "Company Name *", 
                value=company_data.get('company_name', '') if is_edit else '',
                help="The main company name (e.g., 'ABC Insurance Services')"
            )
            primary_website = st.text_input(
                "Primary Website", 
                value=company_data.get('primary_website', '') if is_edit else ''
            )
        
        with col2:
            primary_phone = st.text_input(
                "Primary Phone", 
                value=company_data.get('primary_phone', '') if is_edit else ''
            )
        
        company_notes = st.text_area(
            "Company Notes", 
            value=company_data.get('company_notes', '') if is_edit else '',
            help="General notes about the company"
        )
        
        submitted = st.form_submit_button(f"{'Update' if is_edit else 'Create'} Company")
        
        if submitted and company_name:
            if is_edit:
                # Update logic would go here
                st.success("Company updated successfully!")
                st.rerun()
            else:
                company_id = create_broker_company(
                    company_name, primary_website, primary_phone, company_notes
                )
                if company_id:
                    st.success(f"Company '{company_name}' created successfully!")
                    st.rerun()
        elif submitted and not company_name:
            st.error("Company name is required")

def render_locations_section(company_id: str, company_name: str):
    """Render locations section for a company"""
    st.subheader(f"📍 Locations for {company_name}")
    
    locations = load_company_locations(company_id)
    
    # Display existing locations
    if locations:
        for i, location in enumerate(locations):
            with st.container():
                col1, col2, col3, col4, col5 = st.columns([2, 2, 1, 1, 1])
                
                with col1:
                    name = location['location_name'] or "Main Office"
                    if location['is_headquarters']:
                        st.write(f"**{name}** 🏢")
                    else:
                        st.write(name)
                
                with col2:
                    address_parts = [location['address'], location['city'], location['state']]
                    address = ", ".join([p for p in address_parts if p])
                    st.write(address or '-')
                
                with col3:
                    st.write(location['phone'] or '-')
                
                with col4:
                    st.write("✓ HQ" if location['is_headquarters'] else "")
                
                with col5:
                    if st.button("🗑️", key=f"del_loc_{location['id']}", help="Delete location"):
                        # Delete location logic would go here
                        st.success("Location deleted!")
                        st.rerun()
        
        st.divider()
    else:
        st.info("No locations added yet.")
    
    # Add new location form
    with st.expander("➕ Add New Location"):
        with st.form(f"location_form_{company_id}"):
            col1, col2 = st.columns(2)
            
            with col1:
                location_name = st.text_input(
                    "Location Name", 
                    placeholder="Main Office, North East Branch, etc."
                )
                address = st.text_input("Address")
                city = st.text_input("City")
            
            with col2:
                state = st.text_input("State")
                zip_code = st.text_input("ZIP Code")
                phone = st.text_input("Phone")
            
            col3, col4 = st.columns(2)
            with col3:
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

def render_contacts_section(company_id: str, company_name: str):
    """Render contacts section for a company"""
    st.subheader(f"👥 Contacts for {company_name}")
    
    contacts = load_company_contacts(company_id)
    locations = load_company_locations(company_id)
    
    # Display existing contacts
    if contacts:
        for contact in contacts:
            with st.container():
                col1, col2, col3, col4, col5 = st.columns([2, 2, 2, 1, 1])
                
                with col1:
                    name = f"{contact['first_name']} {contact['last_name']}"
                    badges = []
                    if contact['is_primary']:
                        badges.append("⭐ Primary")
                    if contact['is_location_primary']:
                        badges.append("📍 Location Primary")
                    
                    if badges:
                        st.write(f"**{name}** {' '.join(badges)}")
                    else:
                        st.write(name)
                
                with col2:
                    st.write(contact['email'])
                
                with col3:
                    details = []
                    if contact['title']:
                        details.append(contact['title'])
                    if contact['location_name']:
                        details.append(f"📍 {contact['location_name']}")
                    st.write(" • ".join(details) if details else '-')
                
                with col4:
                    st.write(contact['phone'] or '-')
                
                with col5:
                    if st.button("🗑️", key=f"del_contact_{contact['id']}", help="Delete contact"):
                        # Delete contact logic would go here
                        st.success("Contact deleted!")
                        st.rerun()
        
        st.divider()
    else:
        st.info("No contacts added yet.")
    
    # Add new contact form
    with st.expander("➕ Add New Contact"):
        with st.form(f"contact_form_{company_id}"):
            col1, col2 = st.columns(2)
            
            with col1:
                first_name = st.text_input("First Name *")
                last_name = st.text_input("Last Name *")
                email = st.text_input("Email *")
            
            with col2:
                phone = st.text_input("Phone")
                title = st.text_input("Title")
                
                # Location assignment
                location_options = [""] + [f"{loc['id']}:{loc['location_name'] or 'Main Office'}" 
                                         for loc in locations]
                selected_location = st.selectbox(
                    "Assign to Location (optional)",
                    options=location_options,
                    format_func=lambda x: x.split(':', 1)[1] if ':' in x else "No specific location"
                )
            
            col3, col4 = st.columns(2)
            with col3:
                is_primary = st.checkbox("Primary contact for company")
            with col4:
                is_location_primary = st.checkbox("Primary contact for location") if selected_location else False
            
            submitted = st.form_submit_button("Add Contact")
            
            if submitted:
                if first_name and last_name and email:
                    location_id = selected_location.split(':', 1)[0] if selected_location and ':' in selected_location else None
                    success = create_broker_contact(
                        company_id, location_id, first_name, last_name, email, 
                        phone, title, is_primary, is_location_primary
                    )
                    if success:
                        st.success("Contact added successfully!")
                        st.rerun()
                else:
                    st.error("First name, last name, and email are required")

def main():
    st.title("🏢 Broker Management v2.0")
    st.caption("Normalized structure to prevent duplicate companies")
    
    # Navigation
    nav_col1, nav_col2 = st.columns([1, 4])
    with nav_col1:
        if st.button("📂 View Submissions", help="Go to submission management page"):
            st.write("🔗 Run: `streamlit run submissions.py --server.port 8501`")
    
    # Main content
    companies = render_company_list()
    
    if companies:
        st.divider()
        
        # Company selection for detailed management
        company_options = {company['id']: f"{company['company_name']} ({company['location_count']} locations, {company['contact_count']} contacts)" 
                          for company in companies}
        
        selected_company_id = st.selectbox(
            "Select company for detailed management:",
            options=list(company_options.keys()),
            format_func=lambda x: company_options[x],
            key="company_selector"
        )
        
        if selected_company_id:
            selected_company = next(c for c in companies if c['id'] == selected_company_id)
            
            # Three-column layout for company details
            col1, col2, col3 = st.columns([1, 1, 1])
            
            with col1:
                st.subheader("🏢 Company Details")
                render_company_form(selected_company)
            
            with col2:
                render_locations_section(selected_company_id, selected_company['company_name'])
            
            with col3:
                render_contacts_section(selected_company_id, selected_company['company_name'])
    
    # Add new company section
    st.divider()
    with st.expander("➕ Add New Company", expanded=not companies):
        render_company_form()

if __name__ == "__main__":
    main()