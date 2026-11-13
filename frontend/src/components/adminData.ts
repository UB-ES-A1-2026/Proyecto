import { useOutletContext } from 'react-router';
import type { RiderApplication } from '../services/adminRiderService';

// Datos que el panel de administración comparte entre sus pantallas: las solicitudes de rider se
// piden una vez y el resumen, los riders activos y las solicitudes se actualizan juntos.
export type AdminData = {
  applications: RiderApplication[] | null;
  applicationsError: string | null;
  replaceApplication: (updated: RiderApplication) => void;
  reloadApplications: () => void;
};

export function useAdminData(): AdminData {
  return useOutletContext<AdminData>();
}
