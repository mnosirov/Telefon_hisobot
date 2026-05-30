import { useState } from 'react';
import { useSuperAdmin } from '../contexts/SuperAdminContext';
import { Shield, Mail, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';

const AdminLoginPage = () => {
  const { login } = useSuperAdmin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setError('');
      setLoading(true);
      await login(email, password);
    } catch (err) {
      const map = {
        'auth/invalid-credential': 'Email yoki parol noto\'g\'ri',
        'auth/too-many-requests': 'Juda ko\'p urinish. Keyinroq qayta urinib ko\'ring.',
      };
      setError(map[err.code] || err.message || 'Kirishda xato yuz berdi');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-950 via-slate-900 to-indigo-950 flex items-center justify-center p-4">
      {/* Glow effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Badge */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-purple-600 rounded-2xl shadow-lg shadow-purple-500/30 mb-4">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Super Admin Panel</h1>
          <p className="text-purple-300 mt-1 text-sm">Faqat vakolatli foydalanuvchilar uchun</p>
        </div>

        {/* Card */}
        <div className="bg-white/5 backdrop-blur-xl border border-purple-500/20 rounded-2xl p-8 shadow-2xl">
          <h2 className="text-lg font-semibold text-white mb-6">Tizimga kirish</h2>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/20 border border-red-500/30 rounded-lg mb-4">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-purple-300 mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="superadmin@email.com"
                  required
                  className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-purple-500/30 rounded-lg text-white placeholder-purple-500 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm text-purple-300 mb-1.5">Parol</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-400" />
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full pl-10 pr-10 py-2.5 bg-white/5 border border-purple-500/30 rounded-lg text-white placeholder-purple-500 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
                />
                <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-purple-400 hover:text-white">
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-all shadow-lg shadow-purple-500/30 disabled:opacity-60 mt-2"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Kirish...
                </span>
              ) : 'Kirish'}
            </button>
          </form>
        </div>

        <p className="text-center text-purple-800 text-xs mt-6">
          Bu sahifa faqat tizim administratorlari uchun
        </p>
      </div>
    </div>
  );
};

export default AdminLoginPage;
