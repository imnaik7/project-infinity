// Demo mode stand-in for @microsoft/power-apps/app: a fictional signed-in user (no tenant data).
import snapshot from './snapshot.json';

export async function getContext() {
  return {
    app: { appId: 'demo', appSettings: {}, environmentId: 'demo', queryParams: {} },
    host: {},
    user: { fullName: 'Navaneet Naik', userPrincipalName: 'navaneet.naik@infinity.demo', systemUserId: (snapshot as { demoUser: string }).demoUser },
  };
}

export function setConfig() {}
