// Minimal Dataverse Web API client for the Project Infinity scripts (uses the Azure CLI token).
import { execSync } from 'node:child_process';

export const ENV = process.env.DATAVERSE_URL ?? 'https://orgbc4fa1b4.crm.dynamics.com';
export const SOLUTION = process.env.DATAVERSE_SOLUTION ?? 'ProjectInfinity';

let token = '';
let tokenAt = 0;
function getToken() {
  // Refresh every 40 minutes; schema runs can be long
  if (!token || Date.now() - tokenAt > 40 * 60_000) {
    token = execSync(`az account get-access-token --resource ${ENV} --query accessToken -o tsv`, { encoding: 'utf8' }).trim();
    tokenAt = Date.now();
  }
  return token;
}

export const label = (text) => ({ LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: 1033 }] });
export const log = (...a) => console.log(...a);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Calls the Web API inside the ProjectInfinity solution. Retries metadata lock / throttling errors. */
export async function api(method, path, body, { allow404 = false, solution = SOLUTION, headers = {} } = {}) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${ENV}/api/data/v9.2/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${getToken()}`,
        Accept: 'application/json',
        'Content-Type': 'application/json; charset=utf-8',
        'OData-Version': '4.0',
        'OData-MaxVersion': '4.0',
        ...(solution ? { 'MSCRM.SolutionUniqueName': solution } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 404 && allow404) return null;
    const text = await res.text();
    if (res.ok) return text ? JSON.parse(text) : {};
    // 0x80071151 = another customization in progress; 429 = throttled — both are transient
    const transient = res.status === 429 || res.status === 503 || /0x80071151|0x80044150|in progress|try again/i.test(text);
    if (transient && attempt < 8) {
      await sleep(Math.min(30000, 2000 * attempt));
      continue;
    }
    throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 800)}`);
  }
}

export async function publishAll() {
  await api('POST', 'PublishAllXml', {});
  log('  published customizations');
}
