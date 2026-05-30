import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, serverTimestamp, query, orderBy, where, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase/config';
import { useAuth } from '../contexts/AuthContext';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import Modal from '../components/ui/Modal';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { Plus, FileText, Image, Link, ExternalLink, Upload, Search, Info, BarChart3, Edit2, Trash2 } from 'lucide-react';
import { formatDate, formatCurrency, formatUSD } from '../utils/helpers';
import { useRef, useCallback } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis } from 'recharts';

const DocumentsPage = () => {
  const { hasPermission, userProfile } = useAuth();
  const shopId = userProfile?.shopId;
  const [docs, setDocs] = useState([]);
  const [phones, setPhones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [phoneSearch, setPhoneSearch] = useState('');
  const [showPhoneResults, setShowPhoneResults] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [editingDoc, setEditingDoc] = useState(null);
  const searchRef = useRef(null);

  const { register, handleSubmit, reset, watch, formState: { errors }, setValue } = useForm();
  const docType = watch('docType', 'file');

  const fetchData = async () => {
    if (!shopId) return;
    try {
      const [docsSnap, phonesSnap] = await Promise.all([
        getDocs(query(collection(db, 'documents'), where('shopId', '==', shopId), orderBy('createdAt', 'desc'))),
        getDocs(query(collection(db, 'phones'), where('shopId', '==', shopId))),
      ]);
      const docsData = [];
      docsSnap.forEach((d) => docsData.push({ id: d.id, ...d.data() }));
      const phonesData = [];
      phonesSnap.forEach((d) => phonesData.push({ id: d.id, ...d.data() }));
      setDocs(docsData);
      setPhones(phonesData);
    } catch (err) {
      console.error(err);
      toast.error('Ma\'lumot yuklashda xato');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [shopId]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowPhoneResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const watchPhone = watch('phoneId');
  const selectedPhone = phones.find((p) => p.id === watchPhone);

  const onSubmit = async (data) => {
    try {
      setSubmitting(true);
      let url = data.url || '';

      if (data.docType !== 'link' && uploadFile) {
        const r = ref(storage, `documents/${Date.now()}_${uploadFile.name}`);
        await uploadBytes(r, uploadFile);
        url = await getDownloadURL(r);
      } else if (editingDoc && !uploadFile) {
        url = editingDoc.url;
      }

      const phone = phones.find((p) => p.id === data.phoneId);
      const docData = {
        ...data,
        shopId,
        url,
        phoneName: phone ? `${phone.brand} ${phone.model}` : (data.phoneId === '' ? '' : (editingDoc?.phoneName || '')),
        brand: phone ? phone.brand : (data.phoneId === '' ? '' : (editingDoc?.brand || '')),
        updatedAt: serverTimestamp(),
      };

      if (editingDoc) {
        await updateDoc(doc(db, 'documents', editingDoc.id), docData);
        toast.success('Hujjat yangilandi');
      } else {
        await addDoc(collection(db, 'documents'), {
          ...docData,
          createdAt: serverTimestamp(),
        });
        toast.success('Hujjat qo\'shildi');
      }

      setModalOpen(false);
      setEditingDoc(null);
      reset();
      setUploadFile(null);
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error('Xato yuz berdi');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (doc) => {
    setEditingDoc(doc);
    setPhoneSearch(doc.phoneName || '');
    reset({
      title: doc.title,
      phoneId: doc.phoneId || '',
      docType: doc.docType,
      url: doc.docType === 'link' ? doc.url : '',
      notes: doc.notes || '',
    });
    setModalOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Hujjatni o\'chirmoqchimisiz?')) return;
    try {
      await deleteDoc(doc(db, 'documents', id));
      toast.success('Hujjat o\'chirildi');
      fetchData();
    } catch {
      toast.error('O\'chirishda xato');
    }
  };

  const getIcon = (type) => {
    if (type === 'image') return <Image className="w-5 h-5 text-green-500" />;
    if (type === 'link') return <Link className="w-5 h-5 text-blue-500" />;
    return <FileText className="w-5 h-5 text-orange-500" />;
  };

  // Analysis calculations
  const stats = {
    total: docs.length,
    file: docs.filter(d => d.docType === 'file').length,
    image: docs.filter(d => d.docType === 'image').length,
    link: docs.filter(d => d.docType === 'link').length,
  };

  const brandData = docs.reduce((acc, doc) => {
    let brand = doc.brand;
    if (!brand && doc.phoneName) {
      brand = doc.phoneName.split(' ')[0];
    }
    brand = brand || 'Boshqa';
    acc[brand] = (acc[brand] || 0) + 1;
    return acc;
  }, {});

  const typeChartData = [
    { name: 'Fayl', value: stats.file, color: '#f97316' },
    { name: 'Rasm', value: stats.image, color: '#22c55e' },
    { name: 'Havola', value: stats.link, color: '#3b82f6' },
  ].filter(d => d.value > 0);

  const brandChartData = Object.entries(brandData).map(([name, value]) => ({ name, value }));

  const filteredDocs = docs.filter(doc => {
    const matchesSearch = 
      doc.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.phoneName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.notes?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = typeFilter === 'all' || doc.docType === typeFilter;
    return matchesSearch && matchesType;
  });

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-dark-900 dark:text-white">Hujjatlar</h1>
          <p className="text-sm text-dark-400">{docs.length} ta hujjat jami</p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowAnalysis(!showAnalysis)} 
            className={`btn-secondary flex items-center gap-2 ${showAnalysis ? 'bg-primary-50 text-primary-600 border-primary-200' : ''}`}
          >
            <BarChart3 className="w-4 h-4" /> Tahlil
          </button>
          {hasPermission('export_reports') && (
            <button onClick={() => { setEditingDoc(null); reset(); setPhoneSearch(''); setModalOpen(true); }} className="btn-primary">
              <Plus className="w-4 h-4" /> Hujjat qo'shish
            </button>
          )}
        </div>
      </div>

      {/* Analysis Section */}
      {showAnalysis && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 animate-slide-down">
          <div className="lg:col-span-1 space-y-4">
            <div className="card p-4">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <Info className="w-4 h-4 text-primary-500" /> Umumiy statistika
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center p-2 bg-dark-50 dark:bg-dark-700/50 rounded-lg">
                  <span className="text-sm text-dark-500">Jami hujjatlar</span>
                  <span className="font-bold text-dark-900 dark:text-white">{stats.total}</span>
                </div>
                <div className="flex justify-between items-center p-2 bg-orange-50 dark:bg-orange-900/10 rounded-lg">
                  <span className="text-sm text-orange-600">Fayllar</span>
                  <span className="font-bold text-orange-700">{stats.file}</span>
                </div>
                <div className="flex justify-between items-center p-2 bg-green-50 dark:bg-green-900/10 rounded-lg">
                  <span className="text-sm text-green-600">Rasmlar</span>
                  <span className="font-bold text-green-700">{stats.image}</span>
                </div>
                <div className="flex justify-between items-center p-2 bg-blue-50 dark:bg-blue-900/10 rounded-lg">
                  <span className="text-sm text-blue-600">Havolalar</span>
                  <span className="font-bold text-blue-700">{stats.link}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="card p-4 flex flex-col items-center justify-center min-h-[250px]">
            <h3 className="text-sm font-semibold mb-2 self-start">Turlar bo'yicha tahlil</h3>
            <div className="w-full h-full min-h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={typeChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {typeChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  />
                  <Legend verticalAlign="bottom" height={36}/>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card p-4 min-h-[250px]">
            <h3 className="text-sm font-semibold mb-2">Brandlar bo'yicha</h3>
            <div className="w-full h-full min-h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={brandChartData} layout="vertical" margin={{ left: 20 }}>
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} width={80} style={{ fontSize: '12px' }} />
                  <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '12px' }} />
                  <Bar dataKey="value" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-400" />
          <input
            type="text"
            placeholder="Hujjatlarni qidirish..."
            className="input pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <select 
          className="input w-full sm:w-48"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="all">Barcha turlar</option>
          <option value="file">Fayllar</option>
          <option value="image">Rasmlar</option>
          <option value="link">Havolalar</option>
        </select>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredDocs.length === 0 ? (
          <div className="col-span-full text-center py-16 text-dark-400 bg-dark-50 dark:bg-dark-800/50 rounded-2xl border-2 border-dashed border-dark-200 dark:border-dark-700">
            <FileText className="w-16 h-16 mx-auto mb-3 opacity-20" />
            <p>Hujjat topilmadi</p>
          </div>
        ) : (
          filteredDocs.map((doc) => (
            <div key={doc.id} className="card p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 bg-dark-100 dark:bg-dark-700 rounded-lg flex items-center justify-center flex-shrink-0">
                    {getIcon(doc.docType)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-dark-900 dark:text-white truncate">{doc.title}</p>
                    {doc.phoneName && <p className="text-xs text-dark-400">{doc.phoneName}</p>}
                    <p className="text-xs text-dark-400 mt-1">{formatDate(doc.createdAt)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button 
                    onClick={() => handleEdit(doc)}
                    className="p-1.5 rounded-lg hover:bg-primary-50 text-dark-400 hover:text-primary-600 transition-colors"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button 
                    onClick={() => handleDelete(doc.id)}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-dark-400 hover:text-red-600 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              {doc.docType === 'image' && doc.url && (
                <img src={doc.url} alt="" className="mt-3 w-full h-32 object-cover rounded-lg" />
              )}
              {doc.url && (
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 flex items-center gap-1.5 text-sm text-primary-600 hover:underline"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  {doc.docType === 'image' ? 'Katta ko\'rish' : "Ochish"}
                </a>
              )}
              {doc.notes && <p className="mt-2 text-xs text-dark-400">{doc.notes}</p>}
            </div>
          ))
        )}
      </div>

      {/* Modal */}
      <Modal isOpen={modalOpen} onClose={() => { setModalOpen(false); setEditingDoc(null); }} title={editingDoc ? "Hujjatni tahrirlash" : "Hujjat qo'shish"}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="label">Sarlavha *</label>
            <input {...register('title', { required: true })} className="input" />
          </div>

          <div className="relative" ref={searchRef}>
            <label className="label">Telefon (ixtiyoriy)</label>
            <div className="relative">
              <input
                type="text"
                placeholder="Qidiruv (IMEI oxirgi 4 raqami, brand yoki model)..."
                className="input pr-10"
                value={phoneSearch}
                onChange={(e) => {
                  setPhoneSearch(e.target.value);
                  setShowPhoneResults(true);
                  if (!e.target.value) setValue('phoneId', '');
                }}
                onFocus={() => setShowPhoneResults(true)}
              />
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-400" />
            </div>

            {showPhoneResults && (
              <div className="absolute z-50 w-full mt-1 bg-white dark:bg-dark-800 border border-dark-200 dark:border-dark-700 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                {phones.filter(p => {
                  const q = phoneSearch.toLowerCase();
                  if (!q) return true;
                  const last4_1 = p.imei?.slice(-4);
                  const last4_2 = p.imei2?.slice(-4);
                  if (q.length === 4 && (last4_1 === q || last4_2 === q)) return true;
                  
                  return p.brand?.toLowerCase().includes(q) || 
                         p.model?.toLowerCase().includes(q) || 
                         p.imei?.toLowerCase().includes(q) ||
                         p.imei2?.toLowerCase().includes(q);
                }).length === 0 ? (
                  <div className="p-3 text-center text-dark-400 text-sm">Telefon topilmadi</div>
                ) : (
                  phones.filter(p => {
                    const q = phoneSearch.toLowerCase();
                    if (!q) return true;
                    const last4_1 = p.imei?.slice(-4);
                    const last4_2 = p.imei2?.slice(-4);
                    if (q.length === 4 && (last4_1 === q || last4_2 === q)) return true;
                    return p.brand?.toLowerCase().includes(q) || 
                           p.model?.toLowerCase().includes(q) || 
                           p.imei?.toLowerCase().includes(q) ||
                           p.imei2?.toLowerCase().includes(q);
                  }).map(p => (
                    <div
                      key={p.id}
                      className="p-3 hover:bg-dark-50 dark:hover:bg-dark-700 cursor-pointer border-b border-dark-100 dark:border-dark-700 last:border-0"
                      onClick={() => {
                        setValue('phoneId', p.id);
                        setPhoneSearch(`${p.brand} ${p.model} (${p.imei})`);
                        setShowPhoneResults(false);
                      }}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-dark-900 dark:text-white">{p.brand} {p.model}</p>
                          <p className="text-xs text-dark-400 font-mono">IMEI: {p.imei} {p.imei2 ? `/ ${p.imei2}` : ''}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-bold text-primary-500">{formatUSD(p.purchasePriceUSD)}</p>
                          <p className="text-[10px] text-dark-400">{p.condition}</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
            <input type="hidden" {...register('phoneId')} />
          </div>

          <div>
            <label className="label">Hujjat turi</label>
            <select {...register('docType')} className="input">
              <option value="file">Fayl (PDF, hujjat)</option>
              <option value="image">Rasm</option>
              <option value="link">Havolalar (YouTube, Drive)</option>
            </select>
          </div>

          {(docType === 'file' || docType === 'image') && (
            <div>
              <label className="label">Fayl yuklash</label>
              <div className="border-2 border-dashed border-dark-200 dark:border-dark-600 rounded-lg p-4 text-center">
                <input
                  type="file"
                  id="doc-file"
                  className="hidden"
                  accept={docType === 'image' ? 'image/*' : '*'}
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                />
                <label htmlFor="doc-file" className="cursor-pointer flex flex-col items-center gap-2">
                  <Upload className="w-8 h-8 text-dark-400" />
                  {uploadFile ? (
                    <span className="text-sm text-primary-600">{uploadFile.name}</span>
                  ) : (
                    <span className="text-sm text-dark-400">Fayl tanlash</span>
                  )}
                </label>
              </div>
            </div>
          )}

          {docType === 'link' && (
            <div>
              <label className="label">Havola URL *</label>
              <input {...register('url')} className="input" placeholder="https://..." />
            </div>
          )}

          <div>
            <label className="label">Izoh</label>
            <textarea {...register('notes')} className="input" rows={2} />
          </div>

          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">Bekor qilish</button>
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? 'Yuklanmoqda...' : 'Saqlash'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default DocumentsPage;
