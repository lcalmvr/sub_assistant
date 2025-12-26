#!/bin/bash
# Startup script for Broker Portal

set -e

echo "Starting Broker Portal..."

# Check if we're in the right directory
if [ ! -f "api/main.py" ]; then
    echo "Error: Please run this script from the broker_portal directory"
    exit 1
fi

# Activate virtual environment if it exists
if [ -d "../venv" ]; then
    echo "Activating virtual environment..."
    source ../venv/bin/activate
fi

# Install Python dependencies if needed
echo "Checking Python dependencies..."
python3 -c "import fastapi" 2>/dev/null || {
    echo "Installing Python dependencies..."
    pip install fastapi 'uvicorn[standard]' python-multipart email-validator python-jose[cryptography] passlib[bcrypt] sqlalchemy
}

# Check if database migration has been run
echo "Checking database migration..."
python3 -c "
import sys
sys.path.insert(0, '..')
from core.db import get_conn
from sqlalchemy import text
try:
    conn = next(get_conn())
    result = conn.execute(text(\"SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'broker_sessions')\"))
    exists = result.fetchone()[0]
    if not exists:
        print('Running database migration...')
        sql = open('../db_setup/create_broker_auth_tables.sql').read()
        conn.execute(text(sql))
        conn.commit()
        print('Migration completed')
    else:
        print('Migration already applied')
    conn.close()
except Exception as e:
    print(f'Error checking migration: {e}')
    exit(1)
"

# Install Node dependencies if needed
if [ ! -d "frontend/node_modules" ]; then
    echo "Installing Node.js dependencies..."
    cd frontend
    npm install
    cd ..
fi

# Start backend
echo "Starting FastAPI backend on port 8000..."
cd api
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!
cd ..

# Wait a moment for backend to start
sleep 2

# Start frontend
echo "Starting React frontend on port 3000..."
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "=========================================="
echo "Broker Portal is starting!"
echo ""
echo "Backend API: http://localhost:8000"
echo "Frontend: http://localhost:3000"
echo ""
echo "Backend PID: $BACKEND_PID"
echo "Frontend PID: $FRONTEND_PID"
echo ""
echo "To stop the servers, run:"
echo "  kill $BACKEND_PID $FRONTEND_PID"
echo "=========================================="

# Wait for user interrupt
wait

