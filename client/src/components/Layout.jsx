import { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
    Box, Drawer, AppBar, Toolbar, Typography, IconButton, List, ListItem,
    ListItemButton, ListItemIcon, ListItemText, useMediaQuery, useTheme
} from '@mui/material';
import {
    Menu as MenuIcon, LayoutGrid, Users, Layers, Calendar,
    MessageSquare, Terminal, Settings, LogOut, FlaskConical
} from 'lucide-react';

const DRAWER_WIDTH = 280;

export default function Layout() {
    const { logout } = useAuth();
    const [mobileOpen, setMobileOpen] = useState(false);
    const location = useLocation();
    const navigate = useNavigate();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    const handleDrawerToggle = () => {
        setMobileOpen(!mobileOpen);
    };

    const getPageTitle = () => {
        const path = location.pathname;
        if (path === '/') return 'Overview';
        if (path === '/users') return 'User Management';
        if (path === '/groups') return 'Group Management';
        if (path === '/scheduler') return 'Scheduler';
        if (path === '/development') return 'Development';
        if (path === '/terminal') return 'Terminal';
        if (path === '/settings') return 'Settings';
        if (path === '/test-system') return 'System Test';
        return 'Dashboard';
    };

    const menuItems = [
        { text: 'Overview', icon: <LayoutGrid size={20} />, path: '/' },
        { text: 'Users', icon: <Users size={20} />, path: '/users' },
        { text: 'Groups', icon: <Layers size={20} />, path: '/groups' },
        { text: 'Scheduler', icon: <Calendar size={20} />, path: '/scheduler' },
        { text: 'Development', icon: <MessageSquare size={20} />, path: '/development' },
        { text: 'Terminal', icon: <Terminal size={20} />, path: '/terminal' },
        { text: 'System Test', icon: <FlaskConical size={20} />, path: '/test-system' },
        { text: 'Settings', icon: <Settings size={20} />, path: '/settings' },
    ];

    const drawerContent = (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Toolbar sx={{ borderBottom: 1, borderColor: 'divider', px: [2, 3] }}>
                <LayoutGrid size={28} style={{ marginRight: 12, color: theme.palette.primary.main }} />
                <Typography variant="h6" noWrap component="div" sx={{ fontWeight: 700 }}>
                    AbsenBot
                </Typography>
            </Toolbar>
            <List sx={{ flex: 1, p: 2 }}>
                {menuItems.map((item) => (
                    <ListItem key={item.text} disablePadding sx={{ mb: 0.5 }}>
                        <ListItemButton
                            selected={location.pathname === item.path}
                            onClick={() => {
                                navigate(item.path);
                                if (isMobile) setMobileOpen(false);
                            }}
                            sx={{
                                borderRadius: 1.5,
                                '&.Mui-selected': {
                                    bgcolor: 'primary.soft',
                                    color: 'primary.main',
                                    border: '1px solid',
                                    borderColor: 'primary.main',
                                    '&:hover': { bgcolor: 'rgba(59, 130, 246, 0.15)' }
                                }
                            }}
                        >
                            <ListItemIcon sx={{ minWidth: 40, color: location.pathname === item.path ? 'primary.main' : 'text.secondary' }}>
                                {item.icon}
                            </ListItemIcon>
                            <ListItemText primary={item.text} primaryTypographyProps={{ fontWeight: 500 }} />
                        </ListItemButton>
                    </ListItem>
                ))}
            </List>
            <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
                <ListItemButton
                    onClick={logout}
                    sx={{ borderRadius: 1.5, color: 'error.main', '&:hover': { bgcolor: 'error.dark', color: 'white' } }}
                >
                    <ListItemIcon sx={{ minWidth: 40, color: 'inherit' }}><LogOut size={20} /></ListItemIcon>
                    <ListItemText primary="Logout" />
                </ListItemButton>
            </Box>
        </Box>
    );

    return (
        <Box sx={{ display: 'flex' }}>
            <AppBar position="fixed"
                sx={{
                    width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
                    ml: { md: `${DRAWER_WIDTH}px` },
                    bgcolor: 'rgba(15, 23, 42, 0.8)',
                    backdropFilter: 'blur(8px)',
                    borderBottom: 1,
                    borderColor: 'divider',
                    boxShadow: 'none'
                }}
            >
                <Toolbar>
                    <IconButton
                        color="inherit"
                        aria-label="open drawer"
                        edge="start"
                        onClick={handleDrawerToggle}
                        sx={{ mr: 2, display: { md: 'none' } }}
                    >
                        <MenuIcon />
                    </IconButton>
                    <Typography variant="h6" noWrap component="div" sx={{ fontWeight: 600 }}>
                        {getPageTitle()}
                    </Typography>
                </Toolbar>
            </AppBar>

            <Box component="nav" sx={{ width: { md: DRAWER_WIDTH }, flexShrink: { md: 0 } }}>
                {/* Mobile Drawer */}
                <Drawer
                    variant="temporary"
                    open={mobileOpen}
                    onClose={handleDrawerToggle}
                    ModalProps={{ keepMounted: true }}
                    sx={{
                        display: { xs: 'block', md: 'none' },
                        '& .MuiDrawer-paper': { boxSizing: 'border-box', width: DRAWER_WIDTH },
                    }}
                >
                    {drawerContent}
                </Drawer>
                {/* Desktop Drawer */}
                <Drawer
                    variant="permanent"
                    sx={{
                        display: { xs: 'none', md: 'block' },
                        '& .MuiDrawer-paper': { boxSizing: 'border-box', width: DRAWER_WIDTH },
                    }}
                    open
                >
                    {drawerContent}
                </Drawer>
            </Box>

            <Box component="main" sx={{ flexGrow: 1, p: 3, width: { md: `calc(100% - ${DRAWER_WIDTH}px)` }, mt: 8 }}>
                <Outlet />
            </Box>
        </Box>
    );
}
