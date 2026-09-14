import fs from 'node:fs';
import path from 'node:path';
import {collectBingApi,BING_REPO,BING_WORKFLOW} from '../lib/bing-webmaster.mjs';
import {seal,recipientKey} from '../lib/analytics-envelope.mjs';

// The sole output is encrypted for the existing private analytics recipient.
try {
  const output=process.argv[2];
  if(!output || process.env.GITHUB_REPOSITORY!==BING_REPO || process.env.GITHUB_REF!=='refs/heads/main'
    || !['schedule','workflow_dispatch'].includes(process.env.GITHUB_EVENT_NAME)
    || !/^[1-9]\d*$/.test(process.env.GITHUB_RUN_ATTEMPT??'') || !/^[1-9]\d*$/.test(process.env.GITHUB_RUN_ID??'') || !/^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA??'')) throw new Error('invalid_runtime');
  const publicPem=Buffer.from(process.env.ANALYTICS_RECIPIENT_PUBLIC_KEY_BASE64??'','base64').toString('utf8');
  recipientKey(publicPem); // Fail before refreshing credentials when encryption is not configured.
  const credentials={client_id:process.env.BING_WEBMASTER_CLIENT_ID,client_secret:process.env.BING_WEBMASTER_CLIENT_SECRET,refresh_token:process.env.BING_WEBMASTER_REFRESH_TOKEN};
  const payload=await collectBingApi({credentials});
  payload.provenance={repository:BING_REPO,workflow:BING_WORKFLOW,run_id:process.env.GITHUB_RUN_ID,
    run_attempt:Number(process.env.GITHUB_RUN_ATTEMPT),source_sha:process.env.GITHUB_SHA,event:process.env.GITHUB_EVENT_NAME};
  const envelope=seal(payload,publicPem);
  fs.mkdirSync(path.dirname(output),{recursive:true,mode:0o700});
  fs.writeFileSync(output,JSON.stringify(envelope)+'\n',{flag:'wx',mode:0o600});
  console.log('Bing API output retained in an encrypted artifact. Source status: '+payload.status+'.');
} catch(e) {
  const allowed=['not_configured','auth_required','transport','provider_http','invalid_token_response','refresh_rotation_required','future_provider_date'];
  console.error('Bing collection failed: '+(allowed.includes(e.code)?e.code:'configuration_or_validation')+'. No plaintext or credential output.');
  process.exitCode=1;
}
