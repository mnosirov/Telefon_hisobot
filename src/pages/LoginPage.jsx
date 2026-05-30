import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { Smartphone, Lock, Mail, Eye, EyeOff, AlertCircle } from 'lucide-react';

const schema = z.object({
  email: z.string().email('Noto\'g\'ri email format'),
  password: z.string().min(6, 'Kamida 6 ta belgi'),
});

const LoginPage = () => {
  const { login } = useAuth();
  const { appSettings } = useSettings();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(schema) });

  const onSubmit = async (data) => {
    try {
      setError('');
      setLoading(true);
      await login(data.email, data.password);
    } catch (err) {
      const errorMap = {
        'auth/user-not-found': 'Foydalanuvchi topilmadi',
        'auth/wrong-password': 'Noto\'g\'ri parol',
        'auth/invalid-credential': 'Email yoki parol noto\'g\'ri',
        'auth/too-many-requests': 'Juda ko\'p urinish. Keyinroq qayta urinib ko\'ring',
      };
      setError(errorMap[err.code] || 'Kirishda xato yuz berdi');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-dark-900 via-dark-800 to-primary-900 flex items-center justify-center p-4">
      {/* Background pattern */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-primary-600/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-600 rounded-2xl shadow-lg shadow-primary-500/30 mb-4 overflow-hidden">
            {appSettings.logo ? (
              <img src={appSettings.logo} alt="" className="w-full h-full object-cover" />
            ) : (
              <Smartphone className="w-8 h-8 text-white" />
            )}
          </div>
          <h1 className="text-2xl font-bold text-white">{appSettings.name}</h1>
          <p className="text-dark-400 mt-1 text-sm">Telefon do'kon boshqaruv tizimi</p>
        </div>

        {/* Card */}
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-8 shadow-2xl">
          <h2 className="text-xl font-semibold text-white mb-6">Tizimga kirish</h2>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/20 border border-red-500/30 rounded-lg mb-4">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1.5">
                Email manzil
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-400" />
                <input
                  {...register('email')}
                  type="email"
                  placeholder="email@example.com"
                  className="w-full pl-10 pr-4 py-2.5 bg-white/10 border border-white/20 rounded-lg text-white placeholder-dark-400 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                />
              </div>
              {errors.email && (
                <p className="text-red-400 text-xs mt-1">{errors.email.message}</p>
              )}
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1.5">
                Parol
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-400" />
                <input
                  {...register('password')}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-2.5 bg-white/10 border border-white/20 rounded-lg text-white placeholder-dark-400 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-400 hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-red-400 text-xs mt-1">{errors.password.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-all duration-200 shadow-lg shadow-primary-500/30 hover:shadow-primary-500/40 disabled:opacity-60 disabled:cursor-not-allowed mt-2"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Kirish...
                </span>
              ) : (
                'Kirish'
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-dark-500 text-xs mt-6">
          © 2026 PhoneReport. Barcha huquqlar himoyalangan.
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
