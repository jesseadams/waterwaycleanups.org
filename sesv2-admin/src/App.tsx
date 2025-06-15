import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import Dashboard from './components/Dashboard';
import ContactsManagement from './components/contacts/ContactsManagement';
import TemplateManagement from './components/templates/TemplateManagement';
import EmailSender from './components/emails/EmailSender';
import Layout from './components/Layout';
import Login from './components/auth/Login';
import './App.css';
import { RequireAuth } from './components/auth/RequireAuth';

function App() {
  return (
    <Authenticator.Provider>
      <div className="App">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }>
            <Route index element={<Dashboard />} />
            <Route path="contacts" element={<ContactsManagement />} />
            <Route path="templates" element={<TemplateManagement />} />
            <Route path="send-emails" element={<EmailSender />} />
          </Route>
        </Routes>
      </div>
    </Authenticator.Provider>
  );
}

export default App;
