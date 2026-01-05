import { createTheme } from '@mui/material/styles';

const theme = createTheme({
    palette: {
        mode: 'dark',
        primary: {
            main: '#3b82f6', // Blue 500
            light: '#60a5fa', // Blue 400
            dark: '#2563eb', // Blue 600
            contrastText: '#ffffff',
        },
        secondary: {
            main: '#64748b', // Slate 500
            light: '#94a3b8', // Slate 400
            dark: '#475569', // Slate 600
        },
        background: {
            default: '#0f172a', // Slate 900 (Main BG)
            paper: '#1e293b',   // Slate 800 (Card BG)
        },
        text: {
            primary: '#f8fafc', // Slate 50
            secondary: '#94a3b8', // Slate 400
        },
        error: {
            main: '#ef4444', // Red 500
        },
        warning: {
            main: '#f59e0b', // Amber 500
        },
        info: {
            main: '#0ea5e9', // Sky 500
        },
        success: {
            main: '#10b981', // Emerald 500
        },
        divider: '#334155', // Slate 700
    },
    typography: {
        fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
        h1: { fontSize: '2.5rem', fontWeight: 700 },
        h2: { fontSize: '2rem', fontWeight: 700 },
        h3: { fontSize: '1.75rem', fontWeight: 600 },
        h4: { fontSize: '1.5rem', fontWeight: 600 },
        h5: { fontSize: '1.25rem', fontWeight: 600 },
        h6: { fontSize: '1rem', fontWeight: 600 },
        body1: { fontSize: '1rem' },
        body2: { fontSize: '0.875rem' },
    },
    shape: {
        borderRadius: 12,
    },
    components: {
        MuiButton: {
            styleOverrides: {
                root: {
                    textTransform: 'none',
                    fontWeight: 600,
                    borderRadius: 8,
                    padding: '8px 16px',
                },
                containedPrimary: {
                    boxShadow: '0 4px 6px -1px rgba(59, 130, 246, 0.5)',
                    '&:hover': {
                        boxShadow: '0 10px 15px -3px rgba(59, 130, 246, 0.5)',
                    },
                },
            },
        },
        MuiPaper: {
            styleOverrides: {
                root: {
                    backgroundImage: 'none', // Remove default overlay in dark mode
                },
                rounded: {
                    borderRadius: 12,
                    border: '1px solid #334155', // Slate 700 border
                },
            },
        },
        MuiTableCell: {
            styleOverrides: {
                root: {
                    borderBottom: '1px solid #334155',
                },
                head: {
                    fontWeight: 600,
                    color: '#94a3b8',
                    textTransform: 'uppercase',
                    fontSize: '0.75rem',
                    letterSpacing: '0.05em',
                },
            },
        },
        MuiDrawer: {
            styleOverrides: {
                paper: {
                    backgroundColor: '#0f172a',
                    borderRight: '1px solid #334155',
                },
            },
        },
    },
});

export default theme;
