import type { FastifyInstance } from "fastify";
import { pool } from "@nolivendaz/database";

let requests=0,errors=0,totalMs=0;
export async function registerObservability(app:FastifyInstance):Promise<void>{
 app.addHook('onRequest',async r=>{(r as any).__started=process.hrtime.bigint();});
 app.addHook('onResponse',async(r,reply)=>{requests++;if(reply.statusCode>=500)errors++;const s=(r as any).__started as bigint|undefined;if(s)totalMs+=Number(process.hrtime.bigint()-s)/1e6;});
 app.get('/ready',async(_r,reply)=>{try{await pool.query('SELECT 1');return{status:'ready',service:'backoffice-api'}}catch{return reply.code(503).send({status:'not-ready',service:'backoffice-api'})}});
 app.get('/metrics',async(r,reply)=>{if(process.env.METRICS_TOKEN&&r.headers.authorization!==`Bearer ${process.env.METRICS_TOKEN}`)return reply.code(401).send('unauthorized');reply.type('text/plain; version=0.0.4');const avg=requests?totalMs/requests:0;return [`# HELP nolivendaz_http_requests_total HTTP responses served`,`# TYPE nolivendaz_http_requests_total counter`,`nolivendaz_http_requests_total ${requests}`,`# HELP nolivendaz_http_errors_total HTTP 5xx responses`,`# TYPE nolivendaz_http_errors_total counter`,`nolivendaz_http_errors_total ${errors}`,`# HELP nolivendaz_http_request_duration_average_ms Process-local average response time`,`# TYPE nolivendaz_http_request_duration_average_ms gauge`,`nolivendaz_http_request_duration_average_ms ${avg.toFixed(3)}`,''].join('\n');});
}
