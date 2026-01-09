import { Box, Typography, useMediaQuery, useTheme } from '@mui/material';

/**
 * Reusable page header component with title, description, and action buttons
 * Responsive: smaller text on mobile, stacked actions on mobile
 */
export default function PageHeader({ title, description, actions, sx }) {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

    return (
        <Box
            sx={{
                mb: { xs: 2, sm: 3 },
                display: 'flex',
                flexDirection: { xs: 'column', sm: 'row' },
                justifyContent: 'space-between',
                alignItems: { xs: 'flex-start', sm: 'center' },
                gap: 2,
                ...sx
            }}
        >
            <Box>
                <Typography
                    variant="h5"
                    fontWeight={700}
                    sx={{ fontSize: { xs: '1.125rem', sm: '1.25rem' } }}
                >
                    {title}
                </Typography>
                {description && (
                    <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mt: 0.5, fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
                    >
                        {description}
                    </Typography>
                )}
            </Box>
            {actions && (
                <Box
                    sx={{
                        display: 'flex',
                        gap: 1.5,
                        flexWrap: 'wrap',
                        width: isMobile ? '100%' : 'auto',
                        '& > *': isMobile ? { flex: 1, minWidth: '45%' } : {},
                    }}
                >
                    {actions}
                </Box>
            )}
        </Box>
    );
}
