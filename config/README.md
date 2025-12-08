# Database Configuration

## Active Configuration

- **MySQLConfig.js** - ✅ Active MySQL/Sequelize configuration
  - Used by: `backend/index.js`
  - Connection: MySQL via Sequelize ORM

## Archived Configuration

- **DBConfig.js** - ⚠️ Old MongoDB configuration (no longer used)
  - This file contains the old MongoDB connection code
  - **DO NOT USE** - System now uses MySQL only
  - Can be safely deleted or archived

## Migration Notes

The system was migrated from MongoDB to MySQL. All database operations now use:
- Sequelize ORM
- MySQL database
- Models in `backend/models/mysql/`

