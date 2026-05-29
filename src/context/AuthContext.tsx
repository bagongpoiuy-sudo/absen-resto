import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { getMe, signOut as apiSignOut, Profile } from '../lib/api';

type AuthContextType = {
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  profile: null,
  loading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  async function refreshProfile() {
    const token = localStorage.getItem('absenqr_token');
    if (!token) {
      setProfile(null);
      return;
    }

    try {
      const currentProfile = await getMe();
      setProfile(currentProfile);
    } catch {
      setProfile(null);
    }
  }

  useEffect(() => {
    refreshProfile().finally(() => setLoading(false));
  }, []);

  async function signOut() {
    apiSignOut();
    setProfile(null);
  }

  return (
    <AuthContext.Provider value={{ profile, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
