import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

// MySQL Database Configuration
const DB_NAME = process.env.DB_NAME || 'institute_exams';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = process.env.DB_PORT || 3306;

// Create Sequelize instance
const sequelize = new Sequelize(DB_NAME, DB_USER, DB_PASSWORD, {
  host: DB_HOST,
  port: DB_PORT,
  dialect: 'mysql',
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  dialectOptions: {
    charset: 'utf8mb4',
    // Ensure proper encoding for Tamil and other Unicode characters
    connectTimeout: 60000,
    // Set connection encoding to UTF-8
    typeCast: function (field, next) {
      if (field.type === 'VAR_STRING' || field.type === 'STRING' || field.type === 'TEXT') {
        return field.string();
      }
      return next();
    }
  },
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  },
  define: {
    timestamps: true,
    underscored: true,
    freezeTableName: false,
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci'
  }
});

// Test connection
const DBConnect = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ MySQL connection established successfully.');
    
    // Explicitly set connection charset to utf8mb4 for Tamil and Unicode support
    try {
      await sequelize.query("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;");
      await sequelize.query("SET CHARACTER SET utf8mb4;");
      console.log('✅ Database connection charset set to utf8mb4 for Unicode support.');
    } catch (charsetError) {
      console.warn('⚠️ Could not set connection charset (may already be set):', charsetError.message);
    }
    
    // Sync models (set to false in production, use migrations instead)
    if (process.env.SYNC_DB === 'true') {
      await sequelize.sync({ alter: false }); // Use migrations in production
      console.log('✅ Database models synchronized.');
    }
  } catch (error) {
    console.error('❌ Unable to connect to MySQL database:', error);
    process.exit(1);
  }
};

export { sequelize, Sequelize };
export default DBConnect;

