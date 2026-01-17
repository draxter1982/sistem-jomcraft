import React, { useState, useEffect, useRef } from 'react';
import { 
  FileText, Truck, FileCheck, Plus, Trash2, Printer, 
  Save, LogOut, LayoutDashboard, Search, Eye, Wifi, WifiOff,
  Settings, Image as ImageIcon, Upload, Pencil, ArrowLeft,
  DollarSign, AlertCircle, TrendingUp, UserX, Calendar,
  ShoppingBag, FolderPlus, Tag, Menu, X
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, collection, addDoc, updateDoc, setDoc,
  deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp 
} from 'firebase/firestore';
import { 
  getAuth, signInAnonymously, onAuthStateChanged 
} from 'firebase/auth';

// --- 1. KONFIGURASI FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyCcsSol5cyMzmw_B8Eiar3VJHrIkupFDl0",
  authDomain: "jomcraft-sistem.firebaseapp.com",
  projectId: "jomcraft-sistem",
  storageBucket: "jomcraft-sistem.firebasestorage.app",
  messagingSenderId: "907831483104",
  appId: "1:907831483104:web:b19c5824974b2ca7714e85",
  measurementId: "G-KVTNN0DXMM"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const appId = 'jomcraft-system'; 

export default function App() {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pin, setPin] = useState('');
  const [authError, setAuthError] = useState(null);
  const [isDemoMode, setIsDemoMode] = useState(false); // Mode Offline
  
  // Data States
  const [documents, setDocuments] = useState([]);
  const [companyLogo, setCompanyLogo] = useState(null);
  const [expenseCategories, setExpenseCategories] = useState(['Barang Kedai', 'Alat Tulis', 'Pengangkutan', 'Utiliti']);
  
  const [currentView, setCurrentView] = useState('dashboard');
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Edit Mode States
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState(null);
  
  const defaultFormData = {
    type: 'invoice',
    number: '',
    date: new Date().toISOString().split('T')[0],
    clientName: '',
    clientAddress: '',
    clientPhone: '',
    items: [{ id: 1, description: '', quantity: 1, price: 0 }],
    notes: '',
    status: 'Pending',
    paymentStatus: 'unpaid' 
  };

  const defaultExpenseData = {
    type: 'expense',
    date: new Date().toISOString().split('T')[0],
    category: '',
    items: [{ id: 1, description: '', price: 0 }], 
    total: 0
  };

  const [formData, setFormData] = useState(defaultFormData);
  const [expenseData, setExpenseData] = useState(defaultExpenseData);

  // --- 2. AUTHENTICATION & DATA SYNC ---
  useEffect(() => {
    // Jika Demo Mode, skip firebase auth
    if (isDemoMode) {
      setUser({ uid: 'demo-user', isAnonymous: true });
      return;
    }

    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (error) {
        console.error("Auth Error:", error);
        let msg = error.message;
        if (error.code === 'auth/configuration-not-found' || error.code === 'auth/operation-not-allowed') {
          msg = "Sila aktifkan 'Anonymous' di Firebase Console > Authentication > Sign-in method.";
        }
        setAuthError(msg);
      }
    };
    initAuth();
    
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (u) {
        setUser(u);
        setAuthError(null);
      }
    });
    return () => unsubscribe();
  }, [isDemoMode]);

  // Sync Data (Firebase OR LocalStorage for Demo)
  useEffect(() => {
    // 1. Jika Demo Mode (Offline)
    if (isDemoMode) {
      const savedDocs = localStorage.getItem('jomcraft_demo_docs');
      const savedSettings = localStorage.getItem('jomcraft_demo_settings');
      
      if (savedDocs) setDocuments(JSON.parse(savedDocs));
      if (savedSettings) {
        const settings = JSON.parse(savedSettings);
        if (settings.logoUrl) setCompanyLogo(settings.logoUrl);
        if (settings.expenseCategories) setExpenseCategories(settings.expenseCategories);
      }
      return;
    }

    // 2. Jika Firebase Mode (Online)
    if (!user) return;

    const dataCollection = collection(db, 'jomcraft_docs'); 
    const q = query(dataCollection);
    
    const unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
      const docsData = [];
      let settingsLogo = null;
      let loadedCategories = null;

      snapshot.docs.forEach(docSnap => {
        const data = docSnap.data();
        if (docSnap.id === 'app_settings') {
          settingsLogo = data.logoUrl;
          if (data.expenseCategories) loadedCategories = data.expenseCategories;
        } else {
          if (data.type) {
            docsData.push({ id: docSnap.id, ...data });
          }
        }
      });

      docsData.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt) : new Date(0);
        const dateB = b.createdAt ? new Date(b.createdAt) : new Date(0);
        return dateB - dateA;
      });

      setDocuments(docsData);
      if (settingsLogo) setCompanyLogo(settingsLogo);
      if (loadedCategories) setExpenseCategories(loadedCategories);

    }, (error) => {
      console.error("Error fetching data:", error);
      if (error.code === 'permission-denied') {
         setAuthError("Izin Ditolak. Sila set Firestore Rules kepada 'allow read, write: if true;'.");
      }
    });

    return () => unsubscribeSnapshot();
  }, [user, isDemoMode]);

  // Monitor status internet
  useEffect(() => {
    const handleStatusChange = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', handleStatusChange);
    window.addEventListener('offline', handleStatusChange);
    return () => {
      window.removeEventListener('online', handleStatusChange);
      window.removeEventListener('offline', handleStatusChange);
    };
  }, []);

  // --- 3. FUNGSI CRUD (DATABASE & DEMO) ---

  const handleSaveDocument = async (docData) => {
    
    // Logic untuk Demo Mode (LocalStorage)
    if (isDemoMode) {
      const newDoc = { 
        ...docData, 
        id: isEditing && editId ? editId : Date.now().toString(),
        createdAt: new Date().toISOString(), 
        updatedAt: new Date().toISOString() 
      };
      
      let newDocuments;
      if (isEditing && editId) {
        newDocuments = documents.map(d => d.id === editId ? newDoc : d);
      } else {
        newDocuments = [...documents, newDoc];
      }
      
      // Sort
      newDocuments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      setDocuments(newDocuments);
      localStorage.setItem('jomcraft_demo_docs', JSON.stringify(newDocuments));
      
      if (docData.type === 'expense') setCurrentView('expenses');
      else setCurrentView('dashboard');
      
      setIsEditing(false);
      setEditId(null);
      alert("Disimpan (Mode Offline)");
      return;
    }

    // Logic untuk Firebase
    if (!user) { alert("Tiada akses database."); return; }
    
    try {
      if (isEditing && editId) {
        const docRef = doc(db, 'jomcraft_docs', editId);
        const dataToUpdate = { ...docData, updatedAt: new Date().toISOString() };
        delete dataToUpdate.id;
        await updateDoc(docRef, dataToUpdate);
        alert("Rekod berjaya dikemaskini.");
      } else {
        const dataToSave = { ...docData, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        delete dataToSave.id;
        await addDoc(collection(db, 'jomcraft_docs'), dataToSave);
      }

      if (docData.type === 'expense') setCurrentView('expenses');
      else setCurrentView('dashboard');
      setIsEditing(false);
      setEditId(null);
    } catch (error) {
      console.error("Error saving: ", error);
      alert("Gagal menyimpan: " + error.message);
    }
  };

  const handleDeleteDocument = async (docId, type = 'invoice') => {
    if(confirm("Padam rekod ini?")) {
      
      // Demo Mode Delete
      if (isDemoMode) {
        const newDocs = documents.filter(d => d.id !== docId);
        setDocuments(newDocs);
        localStorage.setItem('jomcraft_demo_docs', JSON.stringify(newDocs));
        return;
      }

      // Firebase Delete
      if (!user) return;
      try {
        await deleteDoc(doc(db, 'jomcraft_docs', docId));
        if (type === 'expense') setCurrentView('expenses');
        else setCurrentView('dashboard');
      } catch (error) {
        console.error("Error deleting: ", error);
        alert("Gagal memadam.");
      }
    }
  };

  const handleSaveLogo = async (url) => {
    setCompanyLogo(url);
    alert("Logo dikemaskini!");

    // Demo Mode Save
    if (isDemoMode) {
      const settings = JSON.parse(localStorage.getItem('jomcraft_demo_settings') || '{}');
      settings.logoUrl = url;
      localStorage.setItem('jomcraft_demo_settings', JSON.stringify(settings));
      return;
    }

    // Firebase Save
    if (!user) return;
    try {
      await setDoc(doc(db, 'jomcraft_docs', 'app_settings'), {
        logoUrl: url,
        updatedAt: new Date().toISOString(),
        type: 'settings'
      }, { merge: true });
    } catch (error) {
      console.error("Error saving logo:", error);
    }
  };

  const handleUpdateCategories = async (newCategories) => {
     setExpenseCategories(newCategories);
     
     if (isDemoMode) {
       const settings = JSON.parse(localStorage.getItem('jomcraft_demo_settings') || '{}');
       settings.expenseCategories = newCategories;
       localStorage.setItem('jomcraft_demo_settings', JSON.stringify(settings));
       return;
     }

     if (!user) return;
     try {
       await setDoc(doc(db, 'jomcraft_docs', 'app_settings'), {
         expenseCategories: newCategories,
         updatedAt: new Date().toISOString(),
         type: 'settings'
       }, { merge: true });
     } catch (error) {
       console.error("Error saving categories:", error);
     }
  };

  // --- 4. LOGIC NAVIGATION & LOGIN ---

  const handleCreateNew = () => {
    setFormData({ ...defaultFormData, number: `INV-${Date.now().toString().slice(-6)}` });
    setIsEditing(false);
    setEditId(null);
    setCurrentView('create');
  };

  const handleCreateExpense = () => {
    setExpenseData({ ...defaultExpenseData, category: expenseCategories[0] || '' });
    setIsEditing(false);
    setEditId(null);
    setCurrentView('create_expense');
  };

  const handleEditDocument = (doc) => {
    if (doc.type === 'expense') {
      setExpenseData({ ...defaultExpenseData, ...doc });
      setCurrentView('create_expense');
    } else {
      setFormData({ ...defaultFormData, ...doc });
      setCurrentView('create');
    }
    setIsEditing(true);
    setEditId(doc.id);
  };

  const handleLogin = (e) => {
    e.preventDefault();
    if (pin === '755250') setIsAuthenticated(true); 
    else alert('PIN Salah!');
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setPin('');
    setIsDemoMode(false); // Reset demo mode on logout
  };

  const enterDemoMode = () => {
    setIsDemoMode(true);
    setIsAuthenticated(true); // Bypass PIN for demo convenience, or ask for PIN still
    setAuthError(null);
  };

  // Paparan Error Auth
  if (authError && !isDemoMode) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-md text-center border-l-4 border-red-500">
          <AlertCircle size={48} className="mx-auto text-red-500 mb-4" />
          <h1 className="text-xl font-bold text-slate-800 mb-2">Ralat Sambungan Database</h1>
          <p className="text-slate-600 mb-6 text-sm">{authError}</p>
          
          <div className="flex flex-col gap-3">
            <button onClick={() => window.location.reload()} className="px-4 py-3 bg-slate-100 text-slate-700 font-bold rounded hover:bg-slate-200 w-full">
              Cuba Semula (Reload)
            </button>
            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-slate-300"></span></div>
              <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-2 text-slate-500">ATAU</span></div>
            </div>
            <button onClick={enterDemoMode} className="px-4 py-3 bg-blue-600 text-white font-bold rounded hover:bg-blue-700 w-full shadow-lg flex items-center justify-center gap-2">
              <WifiOff size={18}/> Masuk Mode Offline
            </button>
            <p className="text-xs text-slate-400 mt-2">Mode Offline akan menyimpan data dalam browser ini sahaja.</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-slate-800">JomCraft Admin</h1>
            <p className="text-slate-500 mt-2">Sistem Pengurusan</p>
            <div className={`mt-4 inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${isOnline ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {isOnline ? <><Wifi size={14}/> Online</> : <><WifiOff size={14}/> Offline</>}
            </div>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-center text-xl tracking-widest"
              placeholder="••••••"
              maxLength={6}
            />
            <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition-colors">
              Log Masuk
            </button>
          </form>
          {/* Demo Button for Login Screen too */}
          <div className="mt-6 pt-6 border-t border-slate-100 text-center">
             <button onClick={enterDemoMode} className="text-xs text-slate-400 hover:text-blue-600 underline">Masuk Mode Offline (Tanpa PIN)</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800">
      <MainSystem 
        documents={documents} 
        onLogout={handleLogout}
        currentView={currentView}
        setCurrentView={setCurrentView}
        formData={formData}
        setFormData={setFormData}
        expenseData={expenseData}
        setExpenseData={setExpenseData}
        selectedDoc={selectedDoc}
        setSelectedDoc={setSelectedDoc}
        onSave={handleSaveDocument}
        onDelete={handleDeleteDocument}
        isOnline={isOnline}
        companyLogo={companyLogo}
        onSaveLogo={handleSaveLogo}
        onCreateNew={handleCreateNew}
        onCreateExpense={handleCreateExpense}
        onEdit={handleEditDocument}
        isEditing={isEditing}
        expenseCategories={expenseCategories}
        onUpdateCategories={handleUpdateCategories}
        isDemoMode={isDemoMode}
      />
    </div>
  );
}

// --- SUB-KOMPONEN ---

function MainSystem({ 
  documents, onLogout, currentView, setCurrentView, 
  formData, setFormData, expenseData, setExpenseData, selectedDoc, setSelectedDoc,
  onSave, onDelete, isOnline, companyLogo, onSaveLogo,
  onCreateNew, onCreateExpense, onEdit, isEditing,
  expenseCategories, onUpdateCategories, isDemoMode
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  const renderSidebar = () => (
    <>
      {/* Mobile Menu Button */}
      <div className="lg:hidden fixed top-4 left-4 z-50">
        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 bg-slate-900 text-white rounded-lg shadow-lg">
          {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Overlay for mobile */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        ></div>
      )}

      {/* Sidebar Content */}
      <div className={`fixed lg:static inset-y-0 left-0 w-64 bg-slate-900 text-slate-300 flex flex-col h-screen z-40 shadow-xl transition-transform duration-300 transform ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="p-6 border-b border-slate-700">
          <div className="flex items-center gap-3 mb-4">
             {companyLogo ? (
               <img src={companyLogo} alt="Logo" className="w-10 h-10 object-contain rounded bg-white p-1" />
             ) : (
               <div className="w-10 h-10 bg-blue-600 rounded flex items-center justify-center font-bold text-white">J</div>
             )}
             <h2 className="text-xl font-bold text-white tracking-tight leading-tight">JomCraft<br/><span className="text-blue-500 text-sm font-normal">Sistem Admin</span></h2>
          </div>
          <div className="flex items-center gap-2 mt-1 px-1">
             <div className={`w-2 h-2 rounded-full ${!isDemoMode && isOnline ? 'bg-green-500' : 'bg-orange-500'} animate-pulse`}></div>
             <p className="text-xs text-slate-400 font-medium">
               {isDemoMode ? 'Mode Offline (Browser)' : (isOnline ? 'Database Connected' : 'No Connection')}
             </p>
          </div>
        </div>
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          <div className="text-xs font-bold text-slate-500 uppercase px-4 mb-1">Jualan & Pesanan</div>
          <button onClick={() => { setCurrentView('dashboard'); setMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${currentView === 'dashboard' ? 'bg-blue-600 text-white shadow-lg' : 'hover:bg-slate-800'}`}>
            <LayoutDashboard size={20} /> Dashboard
          </button>
          <button onClick={() => { onCreateNew(); setMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${currentView === 'create' ? 'bg-blue-600 text-white shadow-lg' : 'hover:bg-slate-800'}`}>
            <Plus size={20} /> Buat Invois/DO
          </button>
          
          <div className="text-xs font-bold text-slate-500 uppercase px-4 mb-1 mt-6">Kewangan & Modal</div>
          <button onClick={() => { setCurrentView('expenses'); setMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${currentView === 'expenses' || currentView === 'create_expense' ? 'bg-rose-600 text-white shadow-lg' : 'hover:bg-slate-800'}`}>
            <ShoppingBag size={20} /> Rekod Belanja
          </button>

          <div className="text-xs font-bold text-slate-500 uppercase px-4 mb-1 mt-6">Lain-lain</div>
          <button onClick={() => { setCurrentView('settings'); setMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${currentView === 'settings' ? 'bg-blue-600 text-white shadow-lg' : 'hover:bg-slate-800'}`}>
            <Settings size={20} /> Tetapan Logo
          </button>
        </nav>
        <div className="p-4 border-t border-slate-700">
          <button onClick={onLogout} className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-slate-800 rounded-lg transition-colors">
            <LogOut size={20} /> Log Keluar
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex h-screen overflow-hidden">
      {renderSidebar()}
      {/* Main Content Area - Responsive Width */}
      <main className="flex-1 min-h-screen bg-slate-50 overflow-y-auto w-full lg:w-auto">
        <div className="p-4 lg:p-8 pt-16 lg:pt-8 w-full">
          {isDemoMode && (
            <div className="mb-4 px-4 py-2 bg-orange-100 border border-orange-200 text-orange-700 text-sm rounded-lg flex items-center gap-2">
              <WifiOff size={16}/> Anda sedang menggunakan <strong>Mode Offline</strong>. Data disimpan dalam browser ini sahaja dan tidak akan disegerakkan ke cloud.
            </div>
          )}

          {currentView === 'dashboard' && (
            <Dashboard 
              documents={documents} 
              onView={(doc) => { setSelectedDoc(doc); setCurrentView('view'); }} 
              onEdit={onEdit} 
            />
          )}
          {currentView === 'expenses' && (
            <ExpensesDashboard 
               documents={documents} 
               onCreate={onCreateExpense} 
               onEdit={onEdit} 
               onDelete={onDelete}
               categories={expenseCategories}
               onUpdateCategories={onUpdateCategories}
            />
          )}
          {currentView === 'create' && (
            <CreateForm 
              formData={formData} setFormData={setFormData} 
              onSave={onSave} onCancel={() => setCurrentView('dashboard')}
              isEditing={isEditing}
            />
          )}
          {currentView === 'create_expense' && (
            <CreateExpenseForm
               expenseData={expenseData} setExpenseData={setExpenseData}
               categories={expenseCategories}
               onSave={onSave} onCancel={() => setCurrentView('expenses')}
               isEditing={isEditing}
            />
          )}
          {currentView === 'settings' && (
            <SettingsView currentLogo={companyLogo} onSaveLogo={onSaveLogo} />
          )}
          {currentView === 'view' && selectedDoc && (
            <DocumentView 
              doc={selectedDoc} 
              onBack={() => setCurrentView('dashboard')} 
              onEdit={() => onEdit(selectedDoc)}
              onDelete={() => onDelete(selectedDoc.id)}
              logo={companyLogo}
            />
          )}
        </div>
      </main>
    </div>
  );
}

// --- DASHBOARD (INVOICES/DO) ---
function Dashboard({ documents, onView, onEdit }) {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('all');

  const mainDocuments = documents.filter(doc => doc.type !== 'expense');
  const invoices = mainDocuments.filter(doc => doc.type === 'invoice');
  
  const salesByMonth = {};
  invoices.forEach(doc => {
    const date = new Date(doc.date);
    const monthYear = date.toLocaleString('ms-MY', { month: 'short', year: 'numeric' });
    const total = doc.total || 0;
    if (salesByMonth[monthYear]) salesByMonth[monthYear] += total;
    else salesByMonth[monthYear] = total;
  });

  const monthlySalesArray = Object.entries(salesByMonth).map(([month, total]) => ({ month, total }));

  const debtors = {};
  let totalDebt = 0;
  invoices.forEach(doc => {
    if (doc.paymentStatus === 'unpaid' || !doc.paymentStatus) { 
      const client = doc.clientName || 'Tidak Diketahui';
      const amount = doc.total || 0;
      totalDebt += amount;
      if (debtors[client]) { debtors[client] += amount; } else { debtors[client] = amount; }
    }
  });
  const debtorsArray = Object.entries(debtors).map(([name, amount]) => ({ name, amount }));

  const uniqueMonths = [...new Set(mainDocuments.map(doc => {
      const d = new Date(doc.date);
      return d.toLocaleString('ms-MY', { month: 'long', year: 'numeric' });
  }))];

  const filteredDocs = mainDocuments.filter(doc => {
    const docType = doc.type || ''; 
    const matchesType = filter === 'all' || docType === filter;
    
    const docDate = new Date(doc.date);
    const docMonth = docDate.toLocaleString('ms-MY', { month: 'long', year: 'numeric' });
    const matchesMonth = selectedMonth === 'all' || docMonth === selectedMonth;

    const matchesSearch = (doc.clientName || '').toLowerCase().includes(search.toLowerCase()) || 
                          (doc.number || '').toLowerCase().includes(search.toLowerCase());
    return matchesType && matchesSearch && matchesMonth;
  });

  const currentViewSales = filteredDocs
    .filter(d => d.type !== 'do') 
    .reduce((acc, doc) => acc + (doc.total || 0), 0);

  const currentViewPaid = filteredDocs
    .filter(d => d.type === 'invoice' && d.paymentStatus === 'paid')
    .reduce((acc, doc) => acc + (doc.total || 0), 0);

  const currentViewUnpaid = filteredDocs
    .filter(d => d.type === 'invoice' && (d.paymentStatus === 'unpaid' || !d.paymentStatus))
    .reduce((acc, doc) => acc + (doc.total || 0), 0);

  const getStatusColor = (type) => {
    switch(type) {
      case 'invoice': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'quotation': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'do': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getPaymentStatusBadge = (doc) => {
    if (doc.type !== 'invoice') return null;
    if (doc.paymentStatus === 'paid') {
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700 border border-green-200 uppercase tracking-wide">Dibayar</span>
    }
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 border border-red-200 uppercase tracking-wide">Hutang</span>
  };

  const safeTotal = (doc) => {
    if (doc.total) return doc.total;
    if (doc.items && Array.isArray(doc.items)) {
      return doc.items.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    }
    return 0;
  };

  return (
    <div className="w-full">
      <div className="mb-8">
         <h1 className="text-3xl font-bold text-slate-800">Dashboard Jualan</h1>
         <p className="text-slate-500 mt-1">Pantau jualan, hutang dan dokumen.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 lg:col-span-2">
          <div className="flex items-center gap-2 mb-6">
            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg"><TrendingUp size={20}/></div>
            <h3 className="font-bold text-slate-800">Trend Jualan Bulanan</h3>
          </div>
          <div className="overflow-x-auto">
            <div className="flex items-end gap-4 h-40 pb-2 min-w-[300px]">
              {monthlySalesArray.length > 0 ? monthlySalesArray.map((data, idx) => (
                <div key={idx} className="flex flex-col items-center gap-2 flex-1 group">
                  <div className="w-full bg-blue-50 rounded-t-lg relative h-full flex items-end justify-center group-hover:bg-blue-100 transition-colors">
                     <div 
                        className="w-full mx-2 bg-blue-500 rounded-t-sm transition-all duration-500 relative" 
                        style={{ height: `${Math.min((data.total / (Math.max(...monthlySalesArray.map(d=>d.total)) || 1)) * 100, 100)}%` }}
                     >
                       <span className="absolute -top-8 left-1/2 -translate-x-1/2 text-xs font-bold text-blue-600 bg-white px-1 py-0.5 rounded shadow opacity-0 group-hover:opacity-100 transition-opacity">
                         RM{(data.total/1000).toFixed(1)}k
                       </span>
                     </div>
                  </div>
                  <p className="text-xs font-medium text-slate-500 rotate-0 whitespace-nowrap">{data.month}</p>
                </div>
              )) : (
                <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm">Belum ada data</div>
              )}
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 border-l-4 border-l-red-500">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-red-100 text-red-600 rounded-lg"><UserX size={20}/></div>
              <h3 className="font-bold text-slate-800">Zon Penghutang</h3>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500 uppercase font-bold">Tertunggak</p>
              <p className="text-xl font-bold text-red-600">RM {totalDebt.toFixed(2)}</p>
            </div>
          </div>
          <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
            {debtorsArray.length > 0 ? debtorsArray.map((debtor, idx) => (
               <div key={idx} className="flex justify-between items-center text-sm p-2 bg-slate-50 rounded border border-slate-100">
                 <span className="font-medium text-slate-700 truncate max-w-[120px]" title={debtor.name}>{debtor.name}</span>
                 <span className="font-mono font-bold text-red-600">RM {debtor.amount.toFixed(2)}</span>
               </div>
            )) : (
              <div className="text-center py-8 text-slate-400 text-sm">Tiada hutang tertunggak. Bagus!</div>
            )}
          </div>
        </div>
      </div>
      
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-6 flex flex-col xl:flex-row gap-4 justify-between items-center sticky top-2 z-10">
        <div className="flex flex-col md:flex-row gap-4 w-full xl:w-auto">
          <div className="relative min-w-[200px]">
             <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"><Calendar size={18}/></div>
             <select 
                value={selectedMonth} 
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none font-medium text-slate-700 appearance-none cursor-pointer"
             >
                <option value="all">Semua Bulan</option>
                {uniqueMonths.map(month => (
                  <option key={month} value={month}>{month}</option>
                ))}
             </select>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0">
            {['all', 'invoice', 'quotation', 'do'].map(type => (
              <button key={type} onClick={() => setFilter(type)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${filter === type ? 'bg-slate-800 text-white shadow-md' : 'bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100'}`}>
                {type === 'all' ? 'Semua Jenis' : type.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <div className="relative w-full xl:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input type="text" placeholder="Cari Pelanggan / No. Rujukan..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 pr-4 py-2 w-full border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-shadow" />
        </div>
      </div>

      {selectedMonth !== 'all' && (
        <div className="grid grid-cols-3 gap-4 mb-6 animate-fade-in">
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 flex flex-col">
            <span className="text-xs font-bold text-blue-500 uppercase">Jualan ({selectedMonth})</span>
            <span className="text-xl font-bold text-blue-700">RM {currentViewSales.toFixed(2)}</span>
          </div>
          <div className="bg-green-50 p-4 rounded-lg border border-green-100 flex flex-col">
            <span className="text-xs font-bold text-green-500 uppercase">Kutipan Bayaran</span>
            <span className="text-xl font-bold text-green-700">RM {currentViewPaid.toFixed(2)}</span>
          </div>
          <div className="bg-red-50 p-4 rounded-lg border border-red-100 flex flex-col">
            <span className="text-xs font-bold text-red-500 uppercase">Belum Dibayar</span>
            <span className="text-xl font-bold text-red-700">RM {currentViewUnpaid.toFixed(2)}</span>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Tarikh</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">No. Rujukan</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Pelanggan</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500 text-right">Jumlah</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500 text-center">Status</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500 text-center">Tindakan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredDocs.length === 0 ? (
                <tr><td colSpan="6" className="px-6 py-16 text-center text-slate-500 bg-slate-50/50 italic">Tiada rekod dijumpai.</td></tr>
              ) : (
                filteredDocs.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-6 py-4 text-slate-600 font-mono text-sm">{doc.date}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase border ${getStatusColor(doc.type)}`}>
                          {doc.type.substring(0,3)}
                        </span>
                        <span className="font-semibold text-slate-800">{doc.number}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-800 font-medium">{doc.clientName}</td>
                    <td className="px-6 py-4 text-right font-mono text-slate-700 font-medium">
                      {doc.type === 'do' ? '-' : `RM ${safeTotal(doc).toFixed(2)}`}
                    </td>
                    <td className="px-6 py-4 text-center">
                       {getPaymentStatusBadge(doc)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-2 opacity-80 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => onView(doc)} className="p-2 bg-white border border-slate-200 text-slate-600 hover:bg-slate-800 hover:text-white rounded-lg transition-colors" title="Lihat & Cetak PDF">
                           <Printer size={16} />
                        </button>
                        <button onClick={() => onEdit(doc)} className="p-2 bg-white border border-slate-200 text-blue-600 hover:bg-blue-600 hover:text-white rounded-lg transition-colors" title="Kemaskini / Edit">
                           <Pencil size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// --- EXPENSES DASHBOARD ---
function ExpensesDashboard({ documents, onCreate, onEdit, onDelete, categories, onUpdateCategories }) {
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [showCatModal, setShowCatModal] = useState(false);
  const [newCat, setNewCat] = useState('');

  const expenses = documents.filter(doc => doc.type === 'expense');

  const expenseByMonth = {};
  expenses.forEach(doc => {
    const date = new Date(doc.date);
    const monthYear = date.toLocaleString('ms-MY', { month: 'short', year: 'numeric' });
    const total = doc.total || 0;
    if (expenseByMonth[monthYear]) expenseByMonth[monthYear] += total;
    else expenseByMonth[monthYear] = total;
  });

  const monthlyExpenseArray = Object.entries(expenseByMonth).map(([month, total]) => ({ month, total }));

  const filteredExpenses = expenses.filter(doc => {
    const docDate = new Date(doc.date);
    const docMonth = docDate.toLocaleString('ms-MY', { month: 'long', year: 'numeric' });
    return selectedMonth === 'all' || docMonth === selectedMonth;
  });

  const uniqueMonths = [...new Set(expenses.map(doc => {
      const d = new Date(doc.date);
      return d.toLocaleString('ms-MY', { month: 'long', year: 'numeric' });
  }))];

  const addCategory = () => {
    if (newCat && !categories.includes(newCat)) {
      onUpdateCategories([...categories, newCat]);
      setNewCat('');
    }
  };
  const removeCategory = (cat) => {
    if(confirm(`Padam kategori "${cat}"?`)) {
      onUpdateCategories(categories.filter(c => c !== cat));
    }
  };

  return (
    <div className="w-full">
      <div className="flex justify-between items-end mb-8">
        <div>
           <h1 className="text-3xl font-bold text-slate-800">Rekod Perbelanjaan</h1>
           <p className="text-slate-500 mt-1">Pantau modal keluar dan pembelian barang.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setShowCatModal(true)} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 text-slate-700 font-medium shadow-sm transition-all">
             <Tag size={18} /> Urus Kategori
          </button>
          <button onClick={onCreate} className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-medium shadow-lg hover:shadow-xl transition-all">
             <Plus size={18} /> Tambah Belanja
          </button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-8">
          <div className="flex items-center gap-2 mb-6">
            <div className="p-2 bg-rose-100 text-rose-600 rounded-lg"><TrendingUp size={20}/></div>
            <h3 className="font-bold text-slate-800">Graf Modal Bulanan</h3>
          </div>
          <div className="overflow-x-auto">
            <div className="flex items-end gap-4 h-48 pb-2 min-w-[300px]">
              {monthlyExpenseArray.length > 0 ? monthlyExpenseArray.map((data, idx) => (
                <div key={idx} className="flex flex-col items-center gap-2 flex-1 group">
                  <div className="w-full bg-rose-50 rounded-t-lg relative h-full flex items-end justify-center group-hover:bg-rose-100 transition-colors">
                     <div 
                        className="w-full mx-2 bg-rose-500 rounded-t-sm transition-all duration-500 relative" 
                        style={{ height: `${Math.min((data.total / (Math.max(...monthlyExpenseArray.map(d=>d.total)) || 1)) * 100, 100)}%` }}
                     >
                       <span className="absolute -top-8 left-1/2 -translate-x-1/2 text-xs font-bold text-rose-600 bg-white px-1 py-0.5 rounded shadow opacity-0 group-hover:opacity-100 transition-opacity">
                         RM{(data.total).toFixed(0)}
                       </span>
                     </div>
                  </div>
                  <p className="text-xs font-medium text-slate-500 whitespace-nowrap">{data.month}</p>
                </div>
              )) : (
                <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm">Tiada data perbelanjaan</div>
              )}
            </div>
          </div>
      </div>

      <div className="flex justify-between items-center mb-4 bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
         <div className="flex items-center gap-2">
            <Calendar size={18} className="text-slate-400"/>
            <select 
               value={selectedMonth} 
               onChange={(e) => setSelectedMonth(e.target.value)}
               className="bg-transparent outline-none font-medium text-slate-700"
            >
               <option value="all">Semua Bulan</option>
               {uniqueMonths.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
         </div>
         <div className="text-sm font-bold text-rose-600">
            Total: RM {filteredExpenses.reduce((acc, curr) => acc + (curr.total || 0), 0).toFixed(2)}
         </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Tarikh</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Kategori</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Barang</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500 text-right">Jumlah</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500 text-center">Tindakan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
               {filteredExpenses.length === 0 ? (
                 <tr><td colSpan="5" className="px-6 py-12 text-center text-slate-400 italic">Tiada rekod.</td></tr>
               ) : (
                 filteredExpenses.map(doc => (
                   <tr key={doc.id} className="hover:bg-slate-50">
                     <td className="px-6 py-4 text-slate-600 font-mono text-sm">{doc.date}</td>
                     <td className="px-6 py-4">
                       <span className="px-2 py-1 rounded text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                         {doc.category || 'Umum'}
                       </span>
                     </td>
                     <td className="px-6 py-4 text-slate-800 text-sm">
                        {doc.items && doc.items.length > 0 ? (
                          <div className="flex flex-col">
                             <span className="font-medium">{doc.items[0].description}</span>
                             {doc.items.length > 1 && <span className="text-xs text-slate-400">+{doc.items.length - 1} barang lain</span>}
                          </div>
                        ) : '-'}
                     </td>
                     <td className="px-6 py-4 text-right font-bold text-rose-600 font-mono">RM {doc.total.toFixed(2)}</td>
                     <td className="px-6 py-4 text-center flex justify-center gap-2">
                        <button onClick={() => onEdit(doc)} className="p-2 text-blue-600 hover:bg-blue-50 rounded"><Pencil size={16}/></button>
                        <button onClick={() => onDelete(doc.id, 'expense')} className="p-2 text-red-600 hover:bg-red-50 rounded"><Trash2 size={16}/></button>
                     </td>
                   </tr>
                 ))
               )}
            </tbody>
        </table>
      </div>

      {showCatModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
             <h3 className="text-xl font-bold mb-4 flex items-center gap-2"><Tag/> Urus Kategori</h3>
             <div className="flex gap-2 mb-4">
               <input 
                 value={newCat}
                 onChange={(e) => setNewCat(e.target.value)}
                 className="flex-1 border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-rose-500"
                 placeholder="Nama Kategori Baru..."
               />
               <button onClick={addCategory} className="px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700">Tambah</button>
             </div>
             <div className="space-y-2 max-h-60 overflow-y-auto">
               {categories.map((cat, idx) => (
                 <div key={idx} className="flex justify-between items-center p-2 bg-slate-50 rounded border border-slate-100">
                    <span className="font-medium text-slate-700">{cat}</span>
                    <button onClick={() => removeCategory(cat)} className="text-red-400 hover:text-red-600"><Trash2 size={16}/></button>
                 </div>
               ))}
             </div>
             <button onClick={() => setShowCatModal(false)} className="mt-6 w-full py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50">Tutup</button>
          </div>
        </div>
      )}
    </div>
  );
}

function CreateForm({ formData, setFormData, onSave, onCancel, isEditing }) {
  const addItem = () => {
    setFormData({ ...formData, items: [...formData.items, { id: Date.now(), description: '', quantity: 1, price: 0 }] });
  };
  const removeItem = (id) => {
    if (formData.items.length === 1) return;
    setFormData({ ...formData, items: formData.items.filter(item => item.id !== id) });
  };
  const updateItem = (id, field, value) => {
    setFormData({ ...formData, items: formData.items.map(item => item.id === id ? { ...item, [field]: value } : item) });
  };
  const calculateTotal = () => formData.items.reduce((sum, item) => sum + (item.quantity * item.price), 0);

  return (
    <div className="w-full max-w-5xl mx-auto pb-20">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={onCancel} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><ArrowLeft size={20} className="text-slate-600"/></button>
        <div>
           <h2 className="text-2xl font-bold text-slate-800">{isEditing ? 'Kemaskini Dokumen' : 'Buat Dokumen Baru'}</h2>
           <p className="text-slate-500 text-sm">Isi maklumat di bawah untuk menjana Invois/DO.</p>
        </div>
      </div>
      
      <form onSubmit={(e) => { e.preventDefault(); onSave({ ...formData, total: calculateTotal() }); }} className="bg-white p-8 rounded-xl shadow-sm border border-slate-200">
        
        <div className="flex gap-4 mb-8">
          {['invoice', 'quotation', 'do'].map(type => (
            <button 
              key={type} 
              type="button" 
              disabled={isEditing}
              onClick={() => setFormData({...formData, type})} 
              className={`flex-1 py-3 rounded-lg border-2 font-semibold capitalize transition-all
                ${formData.type === type ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500'}
                ${isEditing && formData.type !== type ? 'opacity-50 cursor-not-allowed bg-slate-50' : ''}
              `}>
              {type}
            </button>
          ))}
        </div>

        {formData.type === 'invoice' && (
          <div className="mb-8 p-4 bg-blue-50 rounded-lg border border-blue-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white rounded-full text-blue-600 shadow-sm"><DollarSign size={20}/></div>
              <div>
                <label className="block text-sm font-bold text-slate-800">Status Bayaran</label>
                <p className="text-xs text-slate-500">Adakah pelanggan sudah membayar?</p>
              </div>
            </div>
            <div className="flex bg-white rounded-lg p-1 border border-slate-200 shadow-sm">
              <button 
                type="button"
                onClick={() => setFormData({...formData, paymentStatus: 'unpaid'})}
                className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${formData.paymentStatus === 'unpaid' || !formData.paymentStatus ? 'bg-red-500 text-white shadow' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                Belum Bayar
              </button>
              <button 
                type="button"
                onClick={() => setFormData({...formData, paymentStatus: 'paid'})}
                className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${formData.paymentStatus === 'paid' ? 'bg-green-500 text-white shadow' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                Sudah Bayar
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
           <div>
             <label className="text-sm font-medium text-slate-700">No. Rujukan</label>
             <input required type="text" value={formData.number} onChange={e => setFormData({...formData, number: e.target.value})} className="w-full mt-1 p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
           </div>
           <div>
             <label className="text-sm font-medium text-slate-700">Tarikh</label>
             <input required type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full mt-1 p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
           </div>
        </div>

        <div className="bg-slate-50 p-6 rounded-lg border border-slate-200 mb-8">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Butiran Pelanggan</h3>
          <div className="grid gap-4">
            <div>
               <label className="text-sm font-medium text-slate-700">Nama Pelanggan / Syarikat</label>
               <input required type="text" value={formData.clientName} onChange={e => setFormData({...formData, clientName: e.target.value})} className="w-full mt-1 p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Cth: En. Ahmad" />
            </div>
            <div>
               <label className="text-sm font-medium text-slate-700">Alamat</label>
               <textarea rows="2" value={formData.clientAddress} onChange={e => setFormData({...formData, clientAddress: e.target.value})} className="w-full mt-1 p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Alamat penuh..." />
            </div>
          </div>
        </div>

        <div className="mb-8">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Item</h3>
          <div className="space-y-3">
            {formData.items.map((item, idx) => (
              <div key={item.id} className="flex gap-2 items-center">
                <span className="w-6 text-center text-slate-400 font-mono text-sm">{idx+1}</span>
                <input required placeholder="Deskripsi Item" value={item.description} onChange={e => updateItem(item.id, 'description', e.target.value)} className="flex-1 p-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none" />
                <input type="number" placeholder="Qty" value={item.quantity} onChange={e => updateItem(item.id, 'quantity', Number(e.target.value))} className="w-20 p-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none" />
                {formData.type !== 'do' && (
                  <input type="number" placeholder="RM" value={item.price} onChange={e => updateItem(item.id, 'price', Number(e.target.value))} className="w-24 p-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none" />
                )}
                <button type="button" onClick={() => removeItem(item.id)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 size={18}/></button>
              </div>
            ))}
            <button type="button" onClick={addItem} className="text-blue-600 text-sm font-semibold flex items-center gap-2 mt-3 px-2 py-1 hover:bg-blue-50 rounded w-fit transition-colors"><Plus size={16}/> Tambah Item</button>
          </div>
        </div>
        
        <div className="mb-8">
          <label className="text-sm font-medium text-slate-700">Nota / Terma</label>
          <textarea rows="3" value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} className="w-full mt-1 p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Contoh: Deposit tidak dikembalikan..." />
        </div>

        <div className="flex justify-end gap-4 pt-6 border-t border-slate-200">
           <button type="button" onClick={onCancel} className="px-6 py-2 border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 font-medium">Batal</button>
           <button type="submit" className={`px-6 py-2 text-white rounded-lg font-medium flex items-center gap-2 shadow-lg hover:shadow-xl transition-all ${isEditing ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
             <Save size={18} /> {isEditing ? 'Kemaskini Dokumen' : 'Simpan Dokumen'}
           </button>
        </div>
      </form>
    </div>
  );
}

function CreateExpenseForm({ expenseData, setExpenseData, categories, onSave, onCancel, isEditing }) {
  const addItem = () => {
    setExpenseData({ ...expenseData, items: [...expenseData.items, { id: Date.now(), description: '', price: 0 }] });
  };
  const removeItem = (id) => {
    if (expenseData.items.length === 1) return;
    setExpenseData({ ...expenseData, items: expenseData.items.filter(item => item.id !== id) });
  };
  const updateItem = (id, field, value) => {
    setExpenseData({ ...expenseData, items: expenseData.items.map(item => item.id === id ? { ...item, [field]: value } : item) });
  };
  const calculateTotal = () => expenseData.items.reduce((sum, item) => sum + (Number(item.price) || 0), 0);

  return (
    <div className="w-full max-w-4xl mx-auto pb-20">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={onCancel} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><ArrowLeft size={20} className="text-slate-600"/></button>
        <div>
           <h2 className="text-2xl font-bold text-slate-800">{isEditing ? 'Kemaskini Perbelanjaan' : 'Tambah Rekod Belanja'}</h2>
           <p className="text-slate-500 text-sm">Masukkan butiran pembelian modal.</p>
        </div>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); onSave({ ...expenseData, total: calculateTotal() }); }} className="bg-white p-8 rounded-xl shadow-sm border border-slate-200">
         <div className="grid grid-cols-2 gap-6 mb-6">
            <div>
              <label className="text-sm font-medium text-slate-700">Tarikh</label>
              <input required type="date" value={expenseData.date} onChange={e => setExpenseData({...expenseData, date: e.target.value})} className="w-full mt-1 p-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-rose-500" />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Kategori</label>
              <select 
                 value={expenseData.category} 
                 onChange={e => setExpenseData({...expenseData, category: e.target.value})}
                 className="w-full mt-1 p-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-rose-500 bg-white"
                 required
              >
                 <option value="">Pilih Kategori...</option>
                 {categories.map((cat, i) => <option key={i} value={cat}>{cat}</option>)}
              </select>
            </div>
         </div>

         <div className="mb-8">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Senarai Barang / Perkhidmatan</h3>
            <div className="space-y-3">
              {expenseData.items.map((item, idx) => (
                <div key={item.id} className="flex gap-2 items-center">
                  <span className="w-6 text-center text-slate-400 font-mono text-sm">{idx+1}</span>
                  <input required placeholder="Nama Barang" value={item.description} onChange={e => updateItem(item.id, 'description', e.target.value)} className="flex-1 p-2 border border-slate-300 rounded focus:ring-2 focus:ring-rose-500 outline-none" />
                  <input type="number" placeholder="RM" value={item.price} onChange={e => updateItem(item.id, 'price', Number(e.target.value))} className="w-24 p-2 border border-slate-300 rounded focus:ring-2 focus:ring-rose-500 outline-none" />
                  <button type="button" onClick={() => removeItem(item.id)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 size={18}/></button>
                </div>
              ))}
              <button type="button" onClick={addItem} className="text-rose-600 text-sm font-semibold flex items-center gap-2 mt-3 px-2 py-1 hover:bg-rose-50 rounded w-fit transition-colors"><Plus size={16}/> Tambah Barang</button>
            </div>
         </div>

         <div className="bg-slate-50 p-4 rounded-lg flex justify-between items-center mb-6 border border-slate-200">
            <span className="font-bold text-slate-600">Jumlah Besar</span>
            <span className="text-2xl font-bold text-rose-600">RM {calculateTotal().toFixed(2)}</span>
         </div>

         <div className="flex justify-end gap-4 border-t border-slate-200 pt-6">
            <button type="button" onClick={onCancel} className="px-6 py-2 border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 font-medium">Batal</button>
            <button type="submit" className="px-6 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 font-medium flex items-center gap-2 shadow-lg">
              <Save size={18} /> Simpan Rekod
            </button>
         </div>
      </form>
    </div>
  );
}

function SettingsView({ currentLogo, onSaveLogo }) {
  const [inputUrl, setInputUrl] = useState(currentLogo || '');
  const [preview, setPreview] = useState(currentLogo || null);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 800 * 1024) { 
        alert("Saiz fail terlalu besar (Max 800KB).");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result);
        setInputUrl(reader.result); 
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      <h2 className="text-3xl font-bold text-slate-800 mb-8">Tetapan Sistem</h2>
      <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200">
        <h3 className="text-xl font-semibold mb-6 flex items-center gap-2">
          <ImageIcon className="text-blue-600"/> Logo Syarikat
        </h3>
        <div className="mb-6 flex flex-col items-center p-6 border-2 border-dashed border-slate-300 rounded-lg bg-slate-50">
           {preview ? <img src={preview} alt="Preview" className="h-32 object-contain mb-4" /> : <div className="h-32 w-full flex items-center justify-center text-slate-400 mb-4">Tiada Logo</div>}
           <p className="text-sm text-slate-500">Logo ini akan dipaparkan dalam semua Invois & DO.</p>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Pilihan 1: URL Gambar</label>
            <input type="text" placeholder="https://..." value={inputUrl.startsWith('data:') ? '' : inputUrl} onChange={(e) => { setInputUrl(e.target.value); setPreview(e.target.value); }} className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none" />
          </div>
          <div className="relative"><div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-300"></div></div><div className="relative flex justify-center text-sm"><span className="px-2 bg-white text-slate-500">ATAU</span></div></div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Pilihan 2: Muat Naik (Max 800KB)</label>
            <label className="flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50 w-fit"><Upload size={18} className="text-slate-600" /><span className="text-slate-700">Pilih Fail</span><input type="file" accept="image/*" onChange={handleFileChange} className="hidden" /></label>
          </div>
        </div>
        <div className="mt-8 pt-6 border-t border-slate-200 flex justify-end">
          <button onClick={() => onSaveLogo(inputUrl)} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center gap-2"><Save size={18} /> Simpan Logo</button>
        </div>
      </div>
    </div>
  );
}