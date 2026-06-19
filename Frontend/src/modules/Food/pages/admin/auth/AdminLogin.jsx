import { useState, useEffect, useRef } from "react"
import { useNavigate, Link } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { adminAPI } from "@food/api"
import { setAuthData } from "@food/utils/auth"
import { ShieldCheck, UserCog, Star, Heart, ArrowRight, Loader2, Mail, Lock, Eye, EyeOff } from "lucide-react"
import logoNew from "@/assets/logo.png"
import { toast } from "sonner"

export default function AdminLogin() {
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const submitting = useRef(false)

  const handleLogin = async (e) => {
    e.preventDefault()
    if (!email || !password) {
      toast.error("Please fill in all fields")
      return
    }
    if (submitting.current) return
    submitting.current = true
    setLoading(true)

    try {
      const response = await adminAPI.login(email.trim(), password)
      const data = response?.data?.data || response?.data || {}

      const accessToken = data.accessToken
      const adminUser = data.user || data.admin
      const refreshToken = data.refreshToken ?? null

      if (!accessToken || !adminUser || !refreshToken) {
        throw new Error("Invalid response from server")
      }

      setAuthData("admin", accessToken, adminUser, refreshToken)
      toast.success("Welcome, Administrator")
      navigate("/admin/food", { replace: true })
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || "Login failed. Check your credentials."
      toast.error(msg)
    } finally {
      setLoading(false)
      submitting.current = false
    }
  }

  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0a] flex flex-col relative overflow-hidden font-['Poppins']">
      {/* Decorative Background Elements */}
      <div className="absolute top-0 left-0 w-full h-[600px] bg-gradient-to-b from-[#DC2626]/10 via-[#DC2626]/5 to-transparent pointer-events-none" />
      <div className="absolute top-[-100px] right-[-100px] w-[500px] h-[500px] bg-[#DC2626]/5 rounded-full blur-[120px] pointer-events-none animate-pulse" />
      <div className="absolute bottom-[-100px] left-[-100px] w-[400px] h-[400px] bg-[#DC2626]/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="w-full max-w-[440px]"
        >
          {/* Logo & Header */}
          <div className="text-center mb-8">
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 20 }}
              className="relative inline-block mb-4"
            >
              <img 
                src={logoNew} 
                alt="RedGo Logo" 
                className="w-32 h-32 md:w-36 md:h-36 object-contain mx-auto"
              />
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="text-gray-400 dark:text-gray-500 font-bold text-xs uppercase tracking-[0.3em]"
            >
              ADMIN PANEL
            </motion.p>
          </div>

          {/* Login Card */}
          <div className="bg-white/80 dark:bg-[#1a1a1a]/80 backdrop-blur-2xl rounded-[3rem] p-8 sm:p-12 shadow-[0_40px_80px_-20px_rgba(126,56,102,0.2)] dark:shadow-none border border-white/20 dark:border-gray-800 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-transparent via-[#DC2626]/20 to-transparent" />

            <div className="mb-10 text-center sm:text-left">
              <h2 className="text-3xl font-black text-gray-900 dark:text-white mb-2 font-['Outfit'] tracking-tight">
                Admin Entry
              </h2>
              <div className="h-1 w-10 bg-[#DC2626] rounded-full mb-3 hidden sm:block" />
              <p className="text-base text-gray-500 dark:text-gray-400 font-medium">
                Authorized access only. Please sign in to continue.
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-[#DC2626] uppercase tracking-[0.2em] ml-1">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="email"
                      required
                      autoFocus
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="block w-full pl-12 pr-6 py-4 bg-gray-50 dark:bg-gray-900/50 text-gray-900 dark:text-white border-2 border-transparent focus:border-[#DC2626]/50 rounded-2xl outline-none transition-all placeholder:text-gray-300 font-bold"
                      placeholder="admin@redgo.com"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center px-1">
                    <label className="text-[10px] font-black text-[#DC2626] uppercase tracking-[0.2em]">Password</label>
                    <Link to="/admin/forgot-password" size="sm" className="text-[10px] font-bold text-gray-400 hover:text-[#DC2626] uppercase tracking-wider transition-colors">Forgot?</Link>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="block w-full pl-12 pr-12 py-4 bg-gray-50 dark:bg-gray-900/50 text-gray-900 dark:text-white border-2 border-transparent focus:border-[#DC2626]/50 rounded-2xl outline-none transition-all placeholder:text-gray-300 font-bold"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4.5 bg-[#DC2626] hover:bg-[#6a2f56] disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400 text-white rounded-2xl font-bold text-lg shadow-xl shadow-[#DC2626]/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2 group overflow-hidden relative"
              >
                {loading ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : (
                  <>
                    <span>Enter Dashboard</span>
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
                <motion.div
                  className="absolute inset-0 bg-white/20 translate-x-[-100%]"
                  whileHover={{ translateX: "100%" }}
                  transition={{ duration: 0.6 }}
                />
              </button>
            </form>
          </div>

          <div className="mt-12 flex justify-center items-center gap-6 opacity-30 grayscale hover:opacity-60 transition-opacity">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4" />
              <span className="text-[10px] font-black uppercase tracking-widest">Secure Access</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Heart className="w-4 h-4" />
              <span className="text-[10px] font-black uppercase tracking-widest">Admin Control</span>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}


