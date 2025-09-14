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

def render():
    """Main render function for the brokers page"""
    st.title("🏢 Broker Management")
    
    # Navigation tabs
    tab1, tab2 = st.tabs(["📋 Brokers List", "➕ Add Broker"])
    
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
        render_broker_form()