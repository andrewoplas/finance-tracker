import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
import urllib.error
from unittest.mock import patch
p=Path('.agents/skills/finance-quick-log/scripts/quick_log.py')
spec=importlib.util.spec_from_file_location('quick',p);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class Opener:
 def __init__(self, mode='ok'):self.requests=[];self.mode=mode
 def open(self,request,timeout):
  self.requests.append(request);body=json.loads(request.data)
  if self.mode=='timeout':raise TimeoutError()
  if self.mode=='redirect':raise urllib.error.HTTPError(request.full_url,302,'redirect',{},io.BytesIO(b'secret'))
  if body['action']=='preview':result={'request_id':request.headers['Idempotency-key'],'persisted':False,'entry':{'amount':'210.00','account_id':'synthetic'},'date':'2026-10-07','digest':'a'*64}
  else:result={'id':'10000000-0000-4000-8000-000000000001','status':'recorded','transaction_id':'10000000-0000-4000-8000-000000000002','persisted':True,'duplicate':False}
  return io.BytesIO(json.dumps(result).encode())
class Tests(unittest.TestCase):
 def test_preview_commit_and_same_retry(self):
  opener=Opener();p=module.run('preview',{'text':'exp synthetic badminton food 210 cash'},module.PRODUCTION,'ft_quick_'+'b'*64,opener)
  result=module.run('commit',p['retry'],module.PRODUCTION,'ft_quick_'+'b'*64,opener);self.assertTrue(result['persisted'])
  module.run('commit',p['retry'],module.PRODUCTION,'ft_quick_'+'b'*64,opener)
  self.assertEqual(opener.requests[1].headers['Idempotency-key'],opener.requests[2].headers['Idempotency-key']);self.assertEqual(opener.requests[1].data,opener.requests[2].data)
 def test_timeouts_redirects_do_not_claim_saved(self):
  for mode in ('timeout','redirect'):
   with self.assertRaises(ValueError):module.run('preview',{'text':'exp synthetic lunch 210 cash'},module.PRODUCTION,'ft_quick_'+'b'*64,Opener(mode))
 def test_private_file_and_origin(self):
  with tempfile.TemporaryDirectory() as d:
   path=Path(d)/'key';path.write_text('ft_quick_'+'b'*64);path.chmod(0o600)
   with patch.dict(module.os.environ,{'FINANCE_QUICK_LOG_KEY_FILE':str(path),'FINANCE_TRACKER_URL':module.PRODUCTION}):
    self.assertEqual(module.configuration()[0],module.PRODUCTION);path.chmod(0o644)
    with self.assertRaises(ValueError):module.configuration()
   with patch.dict(module.os.environ,{'FINANCE_TRACKER_URL':'https://attacker.example'}):
    with self.assertRaises(ValueError):module.configuration()
if __name__=='__main__':unittest.main()
