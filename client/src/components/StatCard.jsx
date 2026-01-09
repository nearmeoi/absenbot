export default function StatCard({
    label,
    value,
    icon: Icon,
    color = 'primary',
    subtext,
    loading = false,
    onClick
}) {
    // Safe value display - handle NaN, null, undefined
    const displayValue = (val) => {
        if (val === null || val === undefined) return '—';
        if (typeof val === 'number' && isNaN(val)) return '—';
        return val;
    };

    const getColors = (c) => {
        switch (c) {
            case 'primary': return 'bg-[#0df259]';
            case 'success': return 'bg-[#82dab0]'; // softened green
            case 'error': return 'bg-[#ff6b6b]'; // soft red
            case 'warning': return 'bg-[#feca57]'; // yellow
            default: return 'bg-white';
        }
    };

    const baseClass = `neo h-full min-h-[140px] p-4 flex flex-col justify-between transition-all border-3 border-black ${getColors(color)}`;
    const hoverClass = onClick ? 'cursor-pointer hover:-translate-y-1 hover:translate-x-1 hover:shadow-[6px_6px_0_#000] active:translate-y-0 active:translate-x-0 active:shadow-[4px_4px_0_#000]' : '';

    if (loading) {
        return (
            <div className="neo h-full min-h-[140px] p-4 bg-white animate-pulse flex flex-col justify-between">
                <div className="w-1/2 h-4 bg-black/10"></div>
                <div className="w-3/4 h-10 bg-black/20"></div>
            </div>
        );
    }

    return (
        <div
            className={`${baseClass} ${hoverClass}`}
            onClick={onClick}
        >
            <div className="flex justify-between items-start">
                <span className="font-bold text-sm uppercase tracking-wider">{label}</span>
                {Icon && (
                    <div className="bg-black text-white p-1">
                        <Icon size={20} strokeWidth={2.5} />
                    </div>
                )}
            </div>

            <div className="mt-2">
                <div className="text-4xl font-black">{displayValue(value)}</div>
                {subtext && (
                    <div className="text-xs font-bold mt-2 border-t-2 border-black/20 pt-2 inline-block">
                        {subtext}
                    </div>
                )}
            </div>
        </div>
    );
}
