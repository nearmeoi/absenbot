import { createTheme } from '@mui/material/styles';

const theme = createTheme({
    palette: {
        mode: 'dark',
        primary: {
            main: '#3b82f6',
            light: '#60a5fa',
            dark: '#2563eb',
            soft: 'rgba(59, 130, 246, 0.12)', // For subtle backgrounds
            contrastText: '#ffffff',
        },
        secondary: {
            main: '#64748b',
            light: '#94a3b8',
            dark: '#475569',
        },
        background: {
            default: '#0a0f1a', // Slightly deeper for contrast
            paper: '#111827',  // Stronger card separation
            elevated: '#1f2937', // For hover states
        },
        text: {
            primary: '#f8fafc',
            secondary: '#94a3b8',
        },
        error: {
            main: '#ef4444',
            soft: 'rgba(239, 68, 68, 0.12)',
        },
        warning: {
            main: '#f59e0b',
            soft: 'rgba(245, 158, 11, 0.12)',
        },
        info: {
            main: '#0ea5e9',
            soft: 'rgba(14, 165, 233, 0.12)',
        },
        success: {
            main: '#10b981',
            soft: 'rgba(16, 185, 129, 0.12)',
        },
        divider: 'rgba(148, 163, 184, 0.12)', // Softer borders
    },
    typography: {
        fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
        // Mobile-first: smaller base, scale up on desktop
        h1: { fontSize: '1.75rem', fontWeight: 700, '@media (min-width:600px)': { fontSize: '2.5rem' } },
        h2: { fontSize: '1.5rem', fontWeight: 700, '@media (min-width:600px)': { fontSize: '2rem' } },
        h3: { fontSize: '1.25rem', fontWeight: 600, '@media (min-width:600px)': { fontSize: '1.75rem' } },
        h4: { fontSize: '1.125rem', fontWeight: 600, '@media (min-width:600px)': { fontSize: '1.5rem' } },
        h5: { fontSize: '1rem', fontWeight: 600, '@media (min-width:600px)': { fontSize: '1.25rem' } },
        h6: { fontSize: '0.875rem', fontWeight: 600, '@media (min-width:600px)': { fontSize: '1rem' } },
        body1: { fontSize: '0.9375rem', '@media (min-width:600px)': { fontSize: '1rem' } },
        body2: { fontSize: '0.8125rem', '@media (min-width:600px)': { fontSize: '0.875rem' } },
        caption: { fontSize: '0.6875rem', letterSpacing: '0.02em', '@media (min-width:600px)': { fontSize: '0.75rem' } },
        button: { fontWeight: 600, letterSpacing: '0.01em' },
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
                    borderRadius: 10,
                    padding: '10px 16px', // Touch-friendly
                    minHeight: 44, // iOS touch target
                },
                containedPrimary: {
                    boxShadow: '0 4px 6px -1px rgba(59, 130, 246, 0.4)',
                    '&:hover': {
                        boxShadow: '0 10px 15px -3px rgba(59, 130, 246, 0.4)',
                    },
                },
                outlined: {
                    borderColor: 'rgba(148, 163, 184, 0.3)',
                    '&:hover': {
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.08)',
                    },
                },
            },
        },
        MuiIconButton: {
            styleOverrides: {
                root: {
                    minWidth: 44, // Touch target
                    minHeight: 44,
                },
            },
        },
        MuiPaper: {
            styleOverrides: {
                root: {
                    backgroundImage: 'none',
                },
                rounded: {
                    borderRadius: 12,
                    border: '1px solid rgba(148, 163, 184, 0.1)',
                },
            },
        },
        MuiCard: {
            styleOverrides: {
                root: {
                    backgroundImage: 'none',
                    border: '1px solid rgba(148, 163, 184, 0.1)',
                    transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
                    '&:hover': {
                        borderColor: 'rgba(148, 163, 184, 0.2)',
                    },
                },
            },
        },
        MuiTableRow: {
            styleOverrides: {
                root: {
                    '&:nth-of-type(odd)': {
                        backgroundColor: 'rgba(255, 255, 255, 0.02)',
                    },
                    '&:hover': {
                        backgroundColor: 'rgba(59, 130, 246, 0.06) !important',
                    },
                },
            },
        },
        MuiTableCell: {
            styleOverrides: {
                root: {
                    borderBottom: '1px solid rgba(148, 163, 184, 0.1)',
                    padding: '12px 16px', // Touch-friendly
                },
                head: {
                    fontWeight: 600,
                    color: '#94a3b8',
                    textTransform: 'uppercase',
                    fontSize: '0.6875rem',
                    letterSpacing: '0.05em',
                    backgroundColor: 'rgba(0, 0, 0, 0.2)',
                },
            },
        },
        MuiDrawer: {
            styleOverrides: {
                paper: {
                    backgroundColor: '#0a0f1a',
                    borderRight: '1px solid rgba(148, 163, 184, 0.1)',
                },
            },
        },
        MuiChip: {
            styleOverrides: {
                root: {
                    fontWeight: 600,
                    letterSpacing: '0.01em',
                },
                sizeSmall: {
                    height: 24,
                    fontSize: '0.6875rem',
                },
            },
        },
        MuiDialog: {
            styleOverrides: {
                paper: {
                    margin: 16, // Mobile margin
                    width: 'calc(100% - 32px)',
                    maxWidth: 480,
                },
            },
        },
        MuiTextField: {
            styleOverrides: {
                root: {
                    '& .MuiInputBase-root': {
                        minHeight: 44, // Touch target
                    },
                },
            },
        },
        MuiListItemButton: {
            styleOverrides: {
                root: {
                    minHeight: 48, // Touch-friendly
                    borderRadius: 8,
                },
            },
        },
    },
});

export default theme;
