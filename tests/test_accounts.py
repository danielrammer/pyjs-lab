import http.cookiejar
import urllib.request
import unittest
from test_learn import LearnTests

class AccountTests(unittest.TestCase):
    setUp=LearnTests.setUp
    start=LearnTests.start
    stop=LearnTests.stop
    tearDown=LearnTests.tearDown
    request=LearnTests.request

    def register(self,name='student'):
        status,data=self.request('/api/account/register','POST',{'username':name,'password':'long-password'})
        self.assertEqual(status,200)
        return data['user']

    def test_isolation_persistence_and_admin_separation(self):
        self.assertEqual(self.request('/api/account/results')[0],401)
        one=self.register()
        self.assertFalse(self.request('/api/admin/session')[1]['authenticated'])
        result={'id':'version1','challengeId':'hello','title':'Hello','language':'python','code':'print(42)','output':'42\n','savedAt':'2026-11-05T10:00:00.000Z','runStatus':'Done'}
        body={'userId':one['id'],'upsert':[result]}
        self.assertEqual(self.request('/api/account/results','POST',body)[1]['results'],[result])
        self.assertEqual(self.request('/api/account/results','POST',body)[1]['results'],[result])
        self.assertEqual(self.request('/api/account/results','POST',body,origin='https://evil.invalid')[0],403)
        self.assertEqual(self.request('/api/account/results','POST',{'userId':'other','upsert':[result]})[0],409)
        self.assertEqual(self.request('/api/account/results','POST',{'userId':one['id'],'upsert':[{**result,'code':33}]})[0],400)
        self.request('/api/account/logout','POST',{})
        self.assertEqual(self.request('/api/account/results')[0],401)
        two=self.register('second')
        self.assertEqual(self.request('/api/account/results')[1]['results'],[])
        self.assertEqual(self.request('/api/account/results','POST',{'userId':two['id'],'deleted':['version1']})[1]['results'],[])
        self.request('/api/account/logout','POST',{})
        self.assertEqual(self.request('/api/account/login','POST',{'username':'student','password':'wrong-password'})[0],401)
        self.stop();self.start()
        self.assertEqual(self.request('/api/account/login','POST',{'username':'STUDENT','password':'long-password'})[0],200)
        self.assertEqual(self.request('/api/account/results')[1]['results'],[result])
        stored=self.server.database.execute('SELECT password FROM users WHERE id=?',(one['id'],)).fetchone()[0]
        self.assertNotIn('long-password',stored)
        self.assertEqual(self.request('/api/account/results','POST',{'userId':one['id'],'deleted':['version1']})[1]['results'],[])
        self.assertEqual(self.request('/api/account/results')[1]['results'],[])

    def test_validation_expiry_and_rate_limit(self):
        self.assertEqual(self.request('/api/account/register','POST',{'username':'xx','password':'short'})[0],400)
        user=self.register()
        self.assertEqual(self.request('/api/account/register','POST',{'username':'student','password':'long-password'})[0],409)
        self.server.database.execute('UPDATE user_sessions SET expires=0');self.server.database.commit()
        self.assertIsNone(self.request('/api/account/session')[1]['user'])
        self.assertEqual(self.request('/api/account/results')[0],401)
        for _ in range(20):
            self.assertEqual(self.request('/api/account/login','POST',{'username':'student','password':'wrong-password'})[0],401)
        self.assertEqual(self.request('/api/account/login','POST',{'username':'student','password':'long-password'})[0],429)

    def test_admin_progress_and_password_reset(self):
        self.assertEqual(self.request('/api/admin/users')[0],401)
        user=self.register()
        self.assertEqual(self.request('/api/admin/users')[0],401)
        path='/api/admin/users/'+user['id']
        self.assertEqual(self.request(path)[0],401)

        self.assertEqual(self.request(path+'/password','POST',{'password':'new-password'})[0],401)
        version={'id':'v1','challengeId':'hello','title':'Hello','language':'python','code':'print(42)','output':'42','savedAt':'2026-11-05T10:00:00Z','runStatus':'Done'}
        versions=[version,{**version,'id':'v2'},{**version,'id':'js','challengeId':'js-hello','language':'javascript'},{**version,'id':'old','challengeId':'removed'}]
        self.assertEqual(self.request('/api/account/results','POST',{'userId':user['id'],'upsert':versions})[0],200)
        self.assertEqual(self.request('/api/admin/login','POST',{'password':'test-secret'})[0],200)
        status,data=self.request('/api/admin/users')
        self.assertEqual(status,200)
        self.assertEqual(data['users'][0]['progress'],{'python':1,'javascript':1})
        self.assertEqual(data['users'][0]['versions'],4)
        self.assertEqual(data['totals'],{'python':41,'javascript':41})
        self.assertNotIn('password',data['users'][0])
        self.assertCountEqual(self.request(path)[1]['results'],versions)
        self.assertEqual(self.request('/api/admin/users/missing')[0],404)
        self.assertEqual(self.request(path+'/password','POST',{'password':'short'})[0],400)
        self.assertEqual(self.request(path+'/password','POST',{'password':'new-password'},origin='https://evil.invalid')[0],403)
        self.assertEqual(self.request(path+'/password','POST',{'password':'new-password'})[1],{'reset':True})
        self.assertIsNone(self.request('/api/account/session')[1]['user'])
        self.assertEqual(self.request('/api/account/login','POST',{'username':'student','password':'long-password'})[0],401)
        self.assertEqual(self.request('/api/account/login','POST',{'username':'student','password':'new-password'})[0],200)
        self.assertEqual(len(self.request('/api/account/results')[1]['results']),4)
        self.request('/api/admin/logout','POST',{})
        self.assertEqual(self.request(path)[0],401)


    def test_self_password_change_keeps_current_session_and_results(self):
        body={'userId':'missing','currentPassword':'long-password','newPassword':'replacement-password'}
        self.assertEqual(self.request('/api/account/password','POST',body)[0],401)
        user=self.register();body['userId']=user['id']
        primary=self.client
        secondary=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.client=secondary
        self.assertEqual(self.request('/api/account/login','POST',{'username':'student','password':'long-password'})[0],200)
        self.client=primary
        result={'id':'v1','challengeId':'hello','title':'Hello','language':'python','code':'print(42)','output':'42','savedAt':'2026-11-06T10:00:00Z'}
        self.request('/api/account/results','POST',{'userId':user['id'],'upsert':[result]})
        self.assertEqual(self.request('/api/account/password','POST',{**body,'userId':'other'})[0],409)
        self.assertEqual(self.request('/api/account/password','POST',{**body,'currentPassword':'wrong-password'})[0],403)
        self.assertEqual(self.request('/api/account/password','POST',{**body,'newPassword':'short'})[0],400)
        self.assertEqual(self.request('/api/account/password','POST',body,origin='https://evil.invalid')[0],403)
        self.assertEqual(self.request('/api/account/password','POST',body)[0],200)
        self.assertEqual(self.request('/api/account/session')[1]['user'],user)
        self.assertEqual(len(self.request('/api/account/results')[1]['results']),1)
        self.client=secondary
        self.assertIsNone(self.request('/api/account/session')[1]['user'])
        self.assertEqual(self.request('/api/account/login','POST',{'username':'student','password':'long-password'})[0],401)
        self.assertEqual(self.request('/api/account/login','POST',{'username':'student','password':'replacement-password'})[0],200)
        self.assertEqual(len(self.request('/api/account/results')[1]['results']),1)

if __name__=='__main__':unittest.main()
