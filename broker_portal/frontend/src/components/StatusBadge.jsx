import React from 'react'

const StatusBadge = ({ status, type = 'status' }) => {
  const getBadgeClass = () => {
    if (type === 'outcome') {
      switch (status) {
        case 'bound':
          return 'badge badge-success'
        case 'lost':
          return 'badge badge-danger'
        case 'declined':
          return 'badge badge-danger'
        case 'pending':
          return 'badge badge-warning'
        default:
          return 'badge badge-info'
      }
    } else {
      switch (status) {
        case 'quoted':
          return 'badge badge-success'
        case 'declined':
          return 'badge badge-danger'
        case 'pending_info':
          return 'badge badge-warning'
        case 'received':
          return 'badge badge-info'
        default:
          return 'badge badge-info'
      }
    }
  }

  const formatStatus = (status) => {
    return status
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  return (
    <span className={getBadgeClass()}>
      {formatStatus(status)}
    </span>
  )
}

export default StatusBadge

