import { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { doc, onSnapshot, setDoc, getDoc } from 'firebase/firestore';

export function useUserStats() {
  const [stats, setStats] = useState<{ credits: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setLoading(false);
      return;
    }

    const userRef = doc(db, 'users', user.uid);
    
    const unsubscribe = onSnapshot(userRef, async (snap) => {
      if (!snap.exists()) {
        // Initialize user with some starter credits if they don't exist
        const initialStats = { credits: 5, email: user.email, createdAt: new Date().toISOString() };
        await setDoc(userRef, initialStats);
        setStats({ credits: 5 });
      } else {
        setStats(snap.data() as { credits: number });
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return { stats, loading };
}
