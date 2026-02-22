// server.js
import 'dotenv/config';
import { handler } from './handler.js';
import express from 'express';

const app = express();

// add a route that lives separately from the SvelteKit app
//app.use('/f', express.static('/files'));

// let SvelteKit handle everything else, including serving prerendered pages and static assets
// Note: Cron jobs are initialized in hooks.server.ts (bundled with SvelteKit)
app.use(handler);

app.listen(3001, () => {
    console.log('listening on port 3001');
});
