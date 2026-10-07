#!/usr/bin/env python3
"""Minimal scoped HTTP integration. Keys never appear in arguments/output. No redirects."""
import json
import os
from pathlib import Path
import re
import stat
import ssl
import sys
import urllib.error
import urllib.request
import uuid

PRODUCTION = 'https://finance-tracker-eosin-eight.vercel.app'
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def configuration():
    base = os.environ.get('FINANCE_TRACKER_URL', PRODUCTION).rstrip('/')
    if base != PRODUCTION:
        raise ValueError('Only the published Finance Tracker origin is allowed')
    path = Path(os.environ.get('FINANCE_QUICK_LOG_KEY_FILE', str(Path.home() / '.config/finance-tracker/quick-log-key')))
    if path.is_symlink() or not path.is_file():
        raise ValueError('Create a quick-log key in app Settings and store it in your private quick-log-key file')
    info = path.stat()
    if info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) & 0o077:
        raise ValueError('The key file must be owned by you with mode 600')
    key = path.read_text().strip()
    if not re.fullmatch(r'ft_quick_[a-f0-9]{64}', key):
        raise ValueError('The private file must contain a quick-log key; SMS inbox keys cannot write expenses')
    return base, key

def call(base, key, request_id, body, opener=None):
    req = urllib.request.Request(base + '/api/v1/quick-log', data=json.dumps(body).encode(), method='POST',
        headers={'Content-Type':'application/json', 'Authorization':'Bearer ' + key, 'Idempotency-Key': request_id})
    # Framework Python on macOS may lack its bundled CA file. Use the OS trust
    # bundle, never an unverified context; explicit SSL_CERT_FILE remains respected.
    cafile = os.environ.get('SSL_CERT_FILE')
    if not cafile and sys.platform == 'darwin' and Path('/etc/ssl/cert.pem').is_file():
        cafile = '/etc/ssl/cert.pem'
    client = opener or urllib.request.build_opener(NoRedirect(), urllib.request.HTTPSHandler(context=ssl.create_default_context(cafile=cafile)))
    try:
        with client.open(req, timeout=20) as response:
            raw = response.read(65537)
            if len(raw) > 65536:
                raise ValueError('Unexpected response size; save outcome is unconfirmed')
            return json.loads(raw)
    except urllib.error.HTTPError as error:
        # Do not print arbitrary upstream bodies, request text, headers, or credentials.
        codes = {401:'Access expired, revoked or invalid',409:'Preview/retry conflict; keep the original request UUID',413:'Request too large',429:'Rate limited; retry the same request later',503:'Finance service unavailable; save outcome is unconfirmed'}
        if error.code == 422:
            try:
                value = json.loads(error.read(4096)); code = value.get('error','')
            except Exception:
                code = ''
            if re.fullmatch(r'[a-z_]{1,80}', str(code)):
                raise ValueError('Clarification required: ' + code) from None
        raise ValueError(codes.get(error.code, 'Request rejected; save outcome is unconfirmed')) from None
    except (urllib.error.URLError, TimeoutError, OSError):
        raise ValueError('Connection failed; save outcome is unconfirmed. Retry the exact same UUID and body') from None

def run(mode, payload, base, key, opener=None):
    if not isinstance(payload, dict):
        raise ValueError('Use a JSON object on stdin')
    if mode == 'preview':
        if set(payload) != {'text'} or not isinstance(payload['text'], str) or len(payload['text'].encode()) > 1000:
            raise ValueError('Preview requires only text, up to 1000 bytes')
        request_id = str(uuid.uuid4())
        result = call(base,key,request_id,{'text':payload['text'],'action':'preview'},opener)
        if not isinstance(result, dict) or result.get('persisted') is not False or result.get('request_id') != request_id or not isinstance(result.get('entry'),dict) or not re.fullmatch(r'[a-f0-9]{64}',str(result.get('digest',''))) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}',str(result.get('date',''))):
            raise ValueError('Invalid preview; do not commit')
        result['retry'] = {'request_id':request_id,'text':payload['text'],'date':result['date'],'digest':result['digest']}
        return result
    if mode != 'commit' or set(payload) != {'request_id','text','date','digest'}:
        raise ValueError('Commit requires the unchanged preview retry object')
    try:
        request_id = str(uuid.UUID(payload['request_id']))
    except (ValueError, TypeError, AttributeError):
        raise ValueError('Invalid request UUID') from None
    if not isinstance(payload['text'],str) or len(payload['text'].encode()) > 1000 or not re.fullmatch(r'\d{4}-\d{2}-\d{2}',str(payload['date'])) or not re.fullmatch(r'[a-f0-9]{64}',str(payload['digest'])):
        raise ValueError('Invalid commit fields')
    result = call(base,key,request_id,{**{k:v for k,v in payload.items() if k!='request_id'},'action':'commit'},opener)
    if not isinstance(result,dict) or result.get('status') not in ('recorded','needs_review') or not isinstance(result.get('duplicate'),bool):
        raise ValueError('Invalid receipt; save outcome is unconfirmed. Preserve this request UUID')
    try:
        uuid.UUID(result['id'])
        if result['status']=='recorded':
            uuid.UUID(result['transaction_id'])
            if result.get('persisted') is not True:
                raise ValueError()
        elif result.get('persisted') is not False or result.get('transaction_id'):
            raise ValueError()
    except (KeyError, ValueError, TypeError, AttributeError):
        raise ValueError('Invalid receipt; save outcome is unconfirmed. Preserve this request UUID') from None
    return result

def main():
    try:
        mode = sys.argv[1] if len(sys.argv)==2 else ''
        if mode not in ('status','preview','commit'):
            raise ValueError('Use status, preview, or commit')
        base,key = configuration()
        if mode=='status':
            print(json.dumps({'configured':True,'origin':base,'authenticated_request_verified':False})); return 0
        raw = sys.stdin.buffer.read(4097)
        if len(raw)>4096:
            raise ValueError('Input too large')
        try:
            payload=json.loads(raw)
        except (ValueError,UnicodeDecodeError):
            raise ValueError('Use JSON on stdin') from None
        print(json.dumps(run(mode,payload,base,key))); return 0
    except ValueError as error:
        print(json.dumps({'error':str(error),'persisted':False if mode=='preview' else None})); return 1
    except Exception:
        print(json.dumps({'error':'Unexpected client failure; save outcome is unconfirmed','persisted':None})); return 1
if __name__=='__main__':
    sys.exit(main())
