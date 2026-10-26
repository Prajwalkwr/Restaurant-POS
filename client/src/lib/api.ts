import axios from 'axios';

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

export async function get<T = any>(url: string, params?: any): Promise<T> {
  const r = await api.get(url, { params });
  return r.data;
}
export async function post<T = any>(url: string, body?: any): Promise<T> {
  const r = await api.post(url, body);
  return r.data;
}
export async function upload<T = any>(url: string, file: File): Promise<T> {
  const formData = new FormData();
  formData.append('image', file);
  const r = await api.post(url, formData);
  return r.data;
}
export async function patch<T = any>(url: string, body?: any): Promise<T> {
  const r = await api.patch(url, body);
  return r.data;
}
export async function del<T = any>(url: string): Promise<T> {
  const r = await api.delete(url);
  return r.data;
}
