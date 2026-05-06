import React, { createContext, useState, useEffect, useContext } from 'react';
import api from '../lib/axios';
import { jwtDecode } from 'jwt-decode';
import { useQueryClient } from '@tanstack/react-query';
import { resetNotificationTracking } from '../hooks/useRealtimeNotifications';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const queryClient = useQueryClient();

    useEffect(() => {
        const loadUser = async () => {
            const token = localStorage.getItem('access_token');
            if (token) {
                try {
                    const response = await api.get('/auth/me/');
                    setUser(response.data);
                } catch (error) {
                    console.error("Failed to load user", error);
                    localStorage.removeItem('access_token');
                    localStorage.removeItem('refresh_token');
                }
            }
            setLoading(false);
        };
        loadUser();
    }, []);

    const login = async (email, password) => {
        const response = await api.post('/auth/login/', { email, password });
        localStorage.setItem('access_token', response.data.access);
        localStorage.setItem('refresh_token', response.data.refresh);

        // Clear any previous session data just in case
        queryClient.removeQueries();

        // Fetch user details
        const userRes = await api.get('/auth/me/');
        setUser(userRes.data);
        return userRes.data;
    };

    const register = async (userData) => {
        await api.post('/auth/register/', userData);
        // After register, you might want to auto-login or redirect to login
    };

    const logout = () => {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        setUser(null);
        // CRITICAL: Clear all React Query cache to prevent data leaking between users
        queryClient.removeQueries();
        queryClient.clear();
        // Reset notification tracking so new user starts fresh
        resetNotificationTracking();
    };

    return (
        <AuthContext.Provider value={{ user, login, register, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
};
