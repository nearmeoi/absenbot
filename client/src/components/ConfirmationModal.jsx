import React from 'react';

const ConfirmationModal = ({ isOpen, onClose, onConfirm, data }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white border-4 border-black shadow-[8px_8px_0_#000] w-full max-w-lg max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="bg-[#FF6B6B] p-4 border-b-4 border-black flex justify-between items-center">
                    <h2 className="text-xl font-black text-white uppercase tracking-wide">
                        ⚠️ Konfirmasi Laporan
                    </h2>
                    <button 
                        onClick={onClose}
                        className="bg-white text-black w-8 h-8 font-bold border-2 border-black hover:bg-gray-100"
                    >
                        X
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">
                    <p className="font-bold text-center bg-yellow-100 border-2 border-black p-2">
                        Mohon cek kembali sebelum mengirim! 🧐
                    </p>

                    <div className="space-y-4">
                        <div className="border-2 border-black p-3 bg-gray-50">
                            <label className="block text-xs font-black uppercase mb-1 bg-black text-white inline-block px-1">Aktivitas</label>
                            <p className="text-sm font-medium whitespace-pre-wrap">{data.aktivitas}</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="border-2 border-black p-3 bg-gray-50">
                                <label className="block text-xs font-black uppercase mb-1 bg-black text-white inline-block px-1">Pembelajaran</label>
                                <p className="text-sm font-medium whitespace-pre-wrap">{data.pembelajaran}</p>
                            </div>
                            <div className="border-2 border-black p-3 bg-gray-50">
                                <label className="block text-xs font-black uppercase mb-1 bg-black text-white inline-block px-1">Kendala</label>
                                <p className="text-sm font-medium whitespace-pre-wrap">{data.kendala}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="p-4 border-t-4 border-black bg-gray-100 flex gap-3">
                    <button 
                        onClick={onClose}
                        className="flex-1 py-3 font-bold border-2 border-black bg-white shadow-[4px_4px_0_#000] active:translate-y-1 transition-all hover:bg-gray-50"
                    >
                        Batal
                    </button>
                    <button 
                        onClick={onConfirm}
                        className="flex-1 py-3 font-black text-white border-2 border-black bg-green-600 shadow-[4px_4px_0_#000] active:translate-y-1 transition-all hover:bg-green-500 uppercase"
                    >
                        Ya, Kirim Sekarang! 🚀
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmationModal;
