const knex = require('knex')({
    client: 'sqlite3',
    connection: {
        filename: "./audit_trail.sqlite"
    },
    useNullAsDefault: true
});

async function initDatabase() {
    // Create Alerts table
    const hasAlertsTable = await knex.schema.hasTable('alerts');
    if (!hasAlertsTable) {
        await knex.schema.createTable('alerts', (table) => {
            table.increments('id').primary();
            table.timestamp('timestamp').defaultTo(knex.fn.now());
            table.string('level'); // CRITICAL, WARNING, INFO
            table.text('message');
        });
        console.log("Database: Created 'alerts' table.");
    }

    // Create Gatekeeper Logs table
    const hasLogsTable = await knex.schema.hasTable('gatekeeper_logs');
    if (!hasLogsTable) {
        await knex.schema.createTable('gatekeeper_logs', (table) => {
            table.increments('id').primary();
            table.timestamp('timestamp').defaultTo(knex.fn.now());
            table.string('user_id');
            table.string('status'); // ALLOWED, DENIED
            table.integer('remaining');
        });
        console.log("Database: Created 'gatekeeper_logs' table.");
    }
}

// Initialize on load
initDatabase();

module.exports = {
    // Audit Logging functions
    logAlert: async (level, message) => {
        return knex('alerts').insert({ level, message });
    },
    
    logGatekeeper: async (user_id, status, remaining) => {
        return knex('gatekeeper_logs').insert({ user_id, status, remaining });
    },

    // Retrieval functions
    getAlerts: async (limit = 50) => {
        return knex('alerts').orderBy('timestamp', 'desc').limit(limit);
    },

    getGatekeeperLogs: async (limit = 50) => {
        return knex('gatekeeper_logs').orderBy('timestamp', 'desc').limit(limit);
    }
};
