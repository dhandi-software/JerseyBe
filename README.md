# Jersey Baju - Backend (FCSV_BE)

Backend service for the FCSV Jersey Baju platform. Built with Express.js, Prisma ORM, and PostgreSQL.

---

## 🚀 Getting Started

### 📦 Installation
```bash
npm install
```

### ⚡ Development
```bash
npm run dev
# or
node src/index.js
```

### 🧪 Database (Prisma)
```bash
npx prisma generate
npx prisma db push
# or
npx prisma migrate dev
```

### 🐳 Docker Services
```bash
docker compose up -d
```

---

## 🛡️ Security & Zero-Trust Architecture

Aplikasi ini menerapkan standar keamanan **Zero-Trust** yang sangat ketat:

1. **Zero-Trust Database Verification (`authMiddleware.js`)**
   - Setiap request yang terotentikasi memverifikasi keberadaan dan status pengguna langsung ke basis data PostgreSQL (`prisma.user.findUnique`).
   - Token dengan role atau id palsu/kadaluwarsa yang telah dihapus di database otomatis ditolak (401/403).

2. **Perlindungan Injeksi SQL & NoSQL / Prisma Operator (`authService.js` & `userRepository.js`)**
   - Runtime type-checking ketat (`typeof username === 'string'`) mencegah eksploitasi filter Prisma Object Injection (contoh: `{ username: { not: "" } }`).
   - Pencarian pengguna menggunakan operator skalar presisi `{ equals: cleanString }`.

3. **Perlindungan IDOR (Insecure Direct Object Reference) (`orderController.js`)**
   - Akses data dan pembuatan pesanan customer selalu dipaksa menggunakan `req.user.id` dari database. Customer tidak dapat menyusup atau melihat pesanan customer lain.

4. **Sanitasi Kredensial (Password Hash Stripping)**
   - Hash password (`bcrypt`) secara konsisten disaring dan dihilangkan dari seluruh return object profil, detail user, maupun daftar pengguna admin.

5. **Anti Foreign-Key Crash pada Penghapusan Akun (`userService.js`)**
   - Transaksi database atomik (`deleteSingleUserInTx`) membersihkan keterikatan referensi desainer pada pesanan, riwayat pesan, keanggotaan ruang chat, serta profil customer/staff sebelum menghapus user.

6. **Path Traversal & WebP Conversion (`index.js` & `upload.js`)**
   - Direktori static file upload `/uploads` diamankan dari teknik dot-dot directory traversal (`../`).
   - Seluruh unggahan gambar otomatis dioptimalkan dan dikonversi ke format **WebP** berkinerja tinggi, dengan fallback otomatis untuk format legacy.

7. **Zero-Secret Leakage Guarantee**
   - Kredensial database, JWT Secret, dan API key tersimpan eksklusif di environment backend dan diabaikan dari version control (`.gitignore`).

---

## 📡 API Documentation

Seluruh endpoint API menggunakan prefix `/api`.

### 🔐 Authentication (`/api/auth`)
| Method | Endpoint | Deskripsi | Akses |
| :--- | :--- | :--- | :--- |
| **POST** | `/login` | Otentikasi user & penerbitan token JWT | Publik |
| **POST** | `/register` | Pendaftaran akun customer baru | Publik |
| **POST** | `/logout` | Invalidasi sesi user | Terotentikasi |
| **PUT** | `/change-password` | Ganti password akun aktif | Terotentikasi |

### 👤 User Self-Service & Compatibility (`/api/user` & `/api/profile`)
| Method | Endpoint | Deskripsi | Akses |
| :--- | :--- | :--- | :--- |
| **GET** | `/api/profile` | Profil akun pengguna yang sedang login | Terotentikasi |
| **GET** | `/api/profile/:id` | Mengambil detail profil berdasarkan user ID | Terotentikasi |
| **PUT** | `/api/profile/:id` | Update nama, bio, dan foto profil (WebP) | Pemilik / Admin |
| **GET** | `/api/user/profile` | Alias profil akun aktif | Terotentikasi |
| **PUT** | `/api/user/change-password` | Alias ganti password akun aktif | Terotentikasi |

### 🛡️ Admin & Manager Management (`/api/admin`)
| Method | Endpoint | Deskripsi | Akses |
| :--- | :--- | :--- | :--- |
| **POST** | `/create-customer` | Membuat akun customer secara manual | Admin, Manager |
| **POST** | `/create-staff` | Membuat akun staf (Admin, Manager, Desain, Gudang) | Admin, Manager |
| **GET** | `/users` | Mengambil seluruh daftar pengguna (Password aman) | Admin, Manager |
| **GET** | `/users/count` | Jumlah user terdaftar per role (`?role=...`) | Admin, Manager |
| **GET** | `/users-role` | Filter daftar user berdasarkan role | Admin, Manager |
| **GET** | `/users/:id` | Detail spesifik profil user | Admin, Manager |
| **PUT** | `/users/:id` | Update data pengguna / staf / customer | Admin, Manager |
| **DELETE**| `/users/:id` | Hapus akun tunggal secara aman | Admin, Manager |
| **POST** | `/users/batch-delete`| Hapus akun massal dalam transaksi database aman | Admin, Manager |
| **GET** | `/designers` | Daftar staf desainer aktif | Admin, Manager, Desain, Gudang |
| **GET** | `/dashboard-stats` | Statistik omset & status pesanan dashboard | Admin, Manager |
| **GET** | `/omset-report` | Laporan omset terperinci berdasarkan rentang waktu | Admin, Manager |
| **GET** | `/chat-customers` | Daftar customer aktif percakapan | Admin, Manager, Desain, Gudang |

### 🛒 Jersey Order Management (`/api/orders`)
| Method | Endpoint | Deskripsi | Akses |
| :--- | :--- | :--- | :--- |
| **GET** | `/track/:orderId` | Pelacakan status & progres pesanan | Publik |
| **POST** | `/` | Membuat pesanan jersey baru | Customer |
| **GET** | `/` | Daftar seluruh pesanan produksi | Terotentikasi |
| **PUT** | `/:id` | Memperbarui detail pesanan | Terotentikasi |
| **PATCH**| `/:id/status` | Update tahapan status pesanan / assign designer | Admin, Manager, Desain |
| **GET** | `/customer/:customerId` | Riwayat pesanan milik customer | Customer (Self), Admin |
| **GET** | `/designer/:designerId` | Tugas pesanan milik staf desainer | Desain, Admin |
| **POST** | `/:id/mockup` | Upload file mockup desain jersey (WebP) | Desain |
| **PATCH**| `/:id/approve-design` | Persetujuan mockup desain oleh customer | Customer, Admin |
| **PATCH**| `/:id/revisi-design` | Permintaan revisi desain dengan catatan feedback | Customer |
| **POST** | `/:id/layout` | Upload layout pola cetak jersey | Desain |
| **PATCH**| `/:id/approve-layout` | Persetujuan layout pola oleh tim | Internal |
| **POST** | `/:id/print` | Upload bukti cetak sublimasi kain | Internal |
| **POST** | `/:id/finishing` | Upload bukti jahit & QC finishing | Internal |
| **POST** | `/:id/damage` | Pencatatan kendala / kerusakan potong & jahit | Gudang, Admin |
| **GET** | `/:id/damage-history` | Riwayat log kerusakan pesanan | Internal |

### 📦 Inventaris Kain & Produk (`/api/bahan-baju`)
| Method | Endpoint | Deskripsi | Akses |
| :--- | :--- | :--- | :--- |
| **GET** | `/` | Katalog bahan jersey & produk kain | Publik (Tamu & Customer) |
| **GET** | `/history` | Riwayat log mutasi stok bahan | Admin, Gudang, Manager |
| **GET** | `/retur` | Daftar pencatatan retur bahan | Admin, Gudang, Manager |
| **POST** | `/` | Tambah bahan kain baru (Auto-WebP) | Admin, Gudang |
| **PUT** | `/:id` | Update data bahan, harga, dan kuantitas stok | Admin, Gudang |
| **DELETE**| `/:id` | Hapus data bahan baku | Admin, Gudang |

### 💬 Real-Time Chat Service (`/api/chat`)
| Method | Endpoint | Deskripsi | Akses |
| :--- | :--- | :--- | :--- |
| **GET** | `/contacts/:userId` | Daftar kontak dan pesan terakhir (Partisipan saja) | Terotentikasi |
| **GET** | `/history/:userId/:other`| Riwayat pesan percakapan aman | Terotentikasi |
| **GET** | `/unread/:userId` | Jumlah pesan belum dibaca | Terotentikasi |
| **POST** | `/upload` | Unggah lampiran chat (Gambar WebP / Dokumen) | Terotentikasi |
| **POST** | `/groups` | Membuat grup chat kolaborasi order | Terotentikasi |
| **POST** | `/groups/:id/members` | Tambah anggota ke grup chat | Terotentikasi |
| **DELETE**| `/groups/:id/members/:uid`| Hapus anggota dari grup chat | Terotentikasi |

---

## 🔌 Socket.io Real-Time Events

- `join`: Join room pengguna dan room grup.
- `send_message`: Mengirimkan pesan real-time ke room tujuan.
- `mark_read`: Menandai pesan telah dibaca secara live.
- `receive_message`: Menerima pesan baru secara langsung di UI.
- `message_deleted`: Sinkronisasi pesan yang ditarik/dihapus.

---

## 🛠️ Tech Stack
- **Runtime:** Node.js
- **Framework:** Express.js
- **Database:** PostgreSQL (via Prisma ORM)
- **Image Processing:** Sharp (Auto WebP Optimization)
- **Security:** Bcrypt, JSON Web Token (JWT), Zero-Trust live DB validation, CORS sandbox
- **Real-Time:** Socket.io
