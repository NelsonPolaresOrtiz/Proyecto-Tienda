export type UserRole = 'admin' | 'vendedor';

export interface User {
  id: number;
  nombre: string;
  email: string;
  rol: UserRole;
  ci?: string;
  telefono?: string;
  sucursal_id?: number | null;
  sucursal_nombre?: string;
  sucursal_codigo?: string;
  es_matriz?: boolean;
  ultimo_login?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  message: string;
  token: string;
  user: User;
  redirectUrl?: string;
  error?: string;
}
