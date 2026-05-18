import React, { createContext, useContext, useEffect, useState } from 'react';
import { ParticipantConfig, loadParticipantConfig } from './participantConfig';
import { setActiveParticipant } from './empaticaConfig';

interface ParticipantContextType {
  config: ParticipantConfig | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const ParticipantContext = createContext<ParticipantContextType>({
  config: null,
  loading: true,
  refresh: async () => {},
});

export function ParticipantProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<ParticipantConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const c = await loadParticipantConfig();
    if (c) setActiveParticipant(c);
    setConfig(c);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  return (
    <ParticipantContext.Provider value={{ config, loading, refresh }}>
      {children}
    </ParticipantContext.Provider>
  );
}

export function useParticipant() {
  return useContext(ParticipantContext);
}
