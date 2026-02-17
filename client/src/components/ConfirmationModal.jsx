import React from 'react';

const ConfirmationModal = ({ isOpen, onClose, onConfirm, data }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white border-4 border-black shadow-[8px_8px_0_#000] w-full max-w-3xl max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="bg-red-500 p-4 border-b-4 border-black flex justify-between items-center flex-shrink-0">
                    <h2 className="text-xl font-black text-white uppercase tracking-wide">
                        Konfirmasi Laporan
                    </h2>
                    <button 
                        onClick={onClose}
                        className="bg-white text-black w-8 h-8 font-bold border-2 border-black hover:bg-gray-100 flex items-center justify-center"
                    >
                        X
                    </button>
                </div>

                {/* Content - Scrollable area */}
                <div className="p-4 md:p-6 space-y-6 overflow-y-auto flex-1">
                    <p className="font-bold text-center bg-yellow-100 border-2 border-black p-2 text-sm uppercase">
                        Mohon cek kembali sebelum mengirim!
                    </p>

                    <div className="space-y-4">
                        <div className="border-2 border-black p-3 bg-gray-50 rounded-md">
                            <label className="block text-xs font-black uppercase mb-2 bg-black text-white inline-block px-2 py-0.5">Aktivitas</label>
                            <p className="text-sm font-medium whitespace-pre-wrap leading-relaxed">{data.aktivitas}</p>
                        </div>

                        <div className="border-2 border-black p-3 bg-gray-50 rounded-md">
                            <label className="block text-xs font-black uppercase mb-2 bg-black text-white inline-block px-2 py-0.5">Pembelajaran</label>
                            <p className="text-sm font-medium whitespace-pre-wrap leading-relaxed">{data.pembelajaran}</p>
                        </div>

                        <div className="border-2 border-black p-3 bg-gray-50 rounded-md">
                            <label className="block text-xs font-black uppercase mb-2 bg-black text-white inline-block px-2 py-0.5">Kendala</label>
                            <p className="text-sm font-medium whitespace-pre-wrap leading-relaxed">{data.kendala}</p>
                        </div>
                    </div>
                </div>

                {/* Actions - Fixed at bottom of modal */}
                <div className="p-4 border-t-4 border-black bg-gray-100 flex gap-3 flex-shrink-0">
                    <button 
                        onClick={onClose}
                        className="flex-1 py-3 font-bold border-2 border-black bg-white shadow-[4px_4px_0_#000] active:shadow-none active:translate-y-1 transition-all hover:bg-gray-50 uppercase text-sm"
                    >
                        Batal
                    </button>
                    <button 
                        onClick={onConfirm}
                        className="flex-1 py-3 font-black text-white border-2 border-black bg-green-600 shadow-[4px_4px_0_#000] active:shadow-none active:translate-y-1 transition-all hover:bg-green-500 uppercase text-sm"
                    >
                        Kirim Sekarang
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmationModal;
