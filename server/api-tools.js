/**
 * API für die Informatik-Werkzeuge (derzeit: SQL-Spielplatz).
 * Nutzt NIE die Nutzerdatenbank – siehe sql-sandbox.js.
 */
import { HttpError } from './util.js';
import { DATASETS, SQL_LIMITS, readSchema, runSandbox } from './sql-sandbox.js';

const BODY_LIMIT = 64 * 1024;

export function registerToolRoutes(router) {
  router.add('GET', '/api/tools/sql/schema', (ctx) => {
    const dataset = ctx.query.get('dataset') || 'hochschule';
    if (!DATASETS[dataset]) throw new HttpError(400, 'Unbekannter Datensatz.');
    ctx.json(200, {
      dataset,
      datasets: Object.entries(DATASETS).map(([id, d]) => ({ id, label: d.label })),
      tables: readSchema(dataset),
      limits: { maxChars: SQL_LIMITS.maxChars, maxStatements: SQL_LIMITS.maxStatements, maxRows: SQL_LIMITS.maxRows, timeoutMs: SQL_LIMITS.timeoutMs }
    });
  });

  router.add('POST', '/api/tools/sql', async (ctx) => {
    // Zu große Anfragen schon am Content-Length erkennen (saubere 413-Antwort).
    if (Number(ctx.req.headers['content-length'] || 0) > BODY_LIMIT) {
      throw new HttpError(413, `Die Anfrage ist zu groß (höchstens ${BODY_LIMIT / 1024} KB).`);
    }
    const body = await ctx.jsonBody(BODY_LIMIT);
    if (!body || typeof body.sql !== 'string') throw new HttpError(400, 'Bitte SQL als Text im Feld „sql“ übergeben.');
    if (body.sql.length > SQL_LIMITS.maxChars) {
      throw new HttpError(400, `Der SQL-Text ist zu lang (höchstens ${SQL_LIMITS.maxChars.toLocaleString('de-DE')} Zeichen).`);
    }
    const dataset = body.dataset ?? 'hochschule';
    if (typeof dataset !== 'string' || !DATASETS[dataset]) throw new HttpError(400, 'Unbekannter Datensatz.');
    const result = await runSandbox(body.sql, dataset);
    if (result.error?.kind === 'busy') throw new HttpError(503, result.error.message);
    ctx.json(200, { dataset, ...result });
  });
}
