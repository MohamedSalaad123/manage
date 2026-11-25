import React, { useState } from 'react';
import { ShieldCheck, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export function AuthPage() {
  const { brand, language, setLanguage, t, needsBootstrap, login, bootstrap } = useAuth();
  const { showError, showSuccess } = useToast();

  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [initializeStarterData, setInitializeStarterData] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (needsBootstrap) {
        await bootstrap({
          fullName,
          username,
          email,
          password,
          initializeStarterData,
        });
        showSuccess(
          language === 'so'
            ? 'Koontada Maamulaha Sare waa la abuuray, nidaamkuna waa diyaar.'
            : 'Super Admin account created and WMS initialized.'
        );
      } else {
        await login(identifier, password);
        showSuccess(language === 'so' ? 'Ku soo dhowow nidaamka WMS.' : 'Signed in successfully.');
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      <div className="lg:w-1/2 bg-[#0B192C] text-white p-8 lg:p-14 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img
                src={brand.companyLogo}
                alt={brand.companyName}
                referrerPolicy="no-referrer"
                className="w-11 h-11 rounded-md object-cover bg-white border border-white/20"
              />
              <div>
                <p className="text-xs font-semibold tracking-wider text-slate-300">ENTERPRISE WMS</p>
                <h1 className="text-sm font-bold text-white">{brand.companyName}</h1>
              </div>
            </div>

            <div className="flex items-center p-0.5 bg-white/10 rounded-md">
              <button
                type="button"
                onClick={() => setLanguage('so')}
                className={`px-2.5 py-1 text-xs font-semibold rounded ${
                  language === 'so' ? 'bg-[#245582] text-white' : 'text-slate-300'
                }`}
              >
                SO
              </button>
              <button
                type="button"
                onClick={() => setLanguage('en')}
                className={`px-2.5 py-1 text-xs font-semibold rounded ${
                  language === 'en' ? 'bg-[#245582] text-white' : 'text-slate-300'
                }`}
              >
                EN
              </button>
            </div>
          </div>

          <div className="mt-14 max-w-lg">
            <h2 className="text-3xl font-bold tracking-tight leading-tight text-balance">
              {brand.companyName}
            </h2>
            <p className="mt-4 text-sm text-slate-300 leading-relaxed">{t.companySubtitle}</p>

            <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-slate-300">
              <div className="p-4 bg-white/5 border border-white/10 rounded-md">
                <p className="font-semibold text-white">
                  {language === 'so' ? 'Bakhaarro Aan Xad Lahayn' : 'Unlimited Warehouses'}
                </p>
                <p className="mt-1 text-slate-400">
                  {language === 'so'
                    ? 'Maamul kaydka iyo shaqaalaha bakhaar kasta hal xarun dhexe.'
                    : 'Independent inventory, valuation, and teams managed centrally.'}
                </p>
              </div>
              <div className="p-4 bg-white/5 border border-white/10 rounded-md">
                <p className="font-semibold text-white">
                  {language === 'so' ? 'Xisaabinta Celceliska Qiimaha' : 'Moving Weighted Average'}
                </p>
                <p className="mt-1 text-slate-400">
                  {language === 'so'
                    ? 'Diiwaan joogto ah (Stock Ledger) iyo wareejin sugan.'
                    : 'Immutable stock ledger, atomic transfers, and audit logs.'}
                </p>
              </div>
            </div>
          </div>
        </div>

        <p className="mt-10 text-xs text-slate-400">
          © {new Date().getFullYear()} {brand.companyName}
        </p>
      </div>

      <div className="lg:w-1/2 flex items-center justify-center p-6 lg:p-14">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-lg p-8">
          {needsBootstrap === null ? (
            <div className="py-12 text-center text-sm text-slate-500">{t.common.loading}</div>
          ) : (
            <>
              <div className="flex items-center gap-2.5 text-[#0B192C]">
                {needsBootstrap ? (
                  <ShieldCheck className="w-5 h-5 text-[#245582]" />
                ) : (
                  <Lock className="w-5 h-5 text-[#245582]" />
                )}
                <h2 className="text-lg font-bold">
                  {needsBootstrap ? t.auth.setupTitle : t.auth.signInTitle}
                </h2>
              </div>
              <p className="mt-1.5 text-xs text-slate-500">
                {needsBootstrap ? t.auth.setupSubtitle : t.auth.signInSubtitle}
              </p>

              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                {needsBootstrap ? (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        {t.auth.fullName}
                      </label>
                      <input
                        type="text"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Abdikadir Khayre"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:border-[#245582]"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          {t.auth.username}
                        </label>
                        <input
                          type="text"
                          required
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          placeholder="admin"
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:border-[#245582]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          {t.auth.email}
                        </label>
                        <input
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="admin@khayre.com"
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:border-[#245582]"
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      {t.auth.identifier}
                    </label>
                    <input
                      type="text"
                      required
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:border-[#245582]"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {t.auth.password}
                  </label>
                  <input
                    type="password"
                    required
                    minLength={needsBootstrap ? 8 : 1}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={needsBootstrap ? 'Min 8 characters' : ''}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:border-[#245582]"
                  />
                </div>

                {needsBootstrap && (
                  <label className="flex items-start gap-2.5 text-xs text-slate-600 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={initializeStarterData}
                      onChange={(e) => setInitializeStarterData(e.target.checked)}
                      className="mt-0.5 rounded border-slate-300 text-[#245582]"
                    />
                    <span>{t.auth.seedStarter}</span>
                  </label>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-[#245582] hover:bg-[#1B4368] rounded-md transition-colors disabled:opacity-60"
                >
                  {submitting
                    ? '...'
                    : needsBootstrap
                    ? t.auth.createAdminBtn
                    : t.auth.signInBtn}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
