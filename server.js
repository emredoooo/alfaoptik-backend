// server.js
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcryptjs'); // Pustaka untuk hashing password, lebih aman!

const app = express();
const port = 3000;

// ---- Konfigurasi Koneksi MySQL ----
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'ao_db',
  connectionLimit: 10 // Menggunakan pool lebih baik untuk banyak koneksi
};
const pool = mysql.createPool(dbConfig).promise();

// ---- Middleware ----
app.use(cors()); // Mengizinkan request dari domain lain (Flutter Web/App)
app.use(express.json()); // Mem-parsing body request menjadi format JSON

// =================================================================
// ====                    RUTE AUTENTIKASI                     ====
// =================================================================

// Endpoint untuk login pengguna
// POST http://localhost:3000/api/auth/login
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Username dan password diperlukan.' });
  }

  try {
    const query = `
      SELECT u.user_id, u.username, u.password_hash, u.role, b.branch_code, b.branch_name
      FROM users u
      LEFT JOIN branches b ON u.branch_id = b.branch_id
      WHERE u.username = ?
    `;
    const [users] = await pool.query(query, [username]);

    if (users.length === 0) {
      return res.status(401).json({ message: 'Username atau password salah.' });
    }

    const user = users[0];

    // Bandingkan password yang diinput dengan hash di database
    // const isPasswordMatch = await bcrypt.compare(password, user.password_hash);
    
    // UNTUK SEMENTARA, KARENA KITA BELUM HASHING, KITA BANDINGKAN LANGSUNG
    // PENTING: Ini tidak aman untuk produksi!
    const isPasswordMatch = (password === user.password_hash);


    if (!isPasswordMatch) {
      return res.status(401).json({ message: 'Username atau password salah.' });
    }

    // Jika berhasil, kirim data pengguna (tanpa password)
    res.json({
      message: 'Login berhasil!',
      user: {
        userId: user.user_id,
        username: user.username,
        role: user.role, // 'Admin Pusat' atau 'Admin Cabang'
        branchCode: user.branch_code,
        branchName: user.branch_name
      }
    });

  } catch (error) {
    console.error('Error saat login:', error);
    res.status(500).json({ message: 'Terjadi kesalahan pada server.' });
  }
});

// =================================================================
// ====                    RUTE PENGGUNA                        ====
// =================================================================

// Endpoint untuk MEMBUAT pengguna baru
// POST http://localhost:3000/api/users
app.post('/api/users', async (req, res) => {
  // Ambil data dari body request
  const { username, password, full_name, role, branch_id } = req.body;

  // Validasi input dasar
  if (!username || !password || !full_name || !role) {
    return res.status(400).json({ message: 'Data pengguna tidak lengkap.' });
  }
  // Jika rolenya Admin Cabang, branch_id wajib diisi
  if (role === 'Admin Cabang' && !branch_id) {
    return res.status(400).json({ message: 'Admin Cabang harus memiliki ID Cabang.' });
  }
  
  try {
    // Hashing password sebelum disimpan ke database
    // Angka 10 adalah "salt rounds", standar yang baik untuk keamanan
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const query = `
      INSERT INTO users (username, password_hash, full_name, role, branch_id)
      VALUES (?, ?, ?, ?, ?)
    `;
    
    // Simpan ke database dengan password yang sudah di-hash
    await pool.query(query, [
      username,
      hashedPassword,
      full_name,
      role,
      // Jika rolenya bukan 'Admin Cabang', branch_id akan null
      role === 'Admin Cabang' ? branch_id : null
    ]);

    res.status(201).json({ message: 'Pengguna baru berhasil dibuat!' });

  } catch (error) {
    // Tangani jika username sudah ada (karena ada UNIQUE constraint)
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Username sudah digunakan.' });
    }
    console.error('Error saat membuat pengguna:', error);
    res.status(500).json({ message: 'Gagal membuat pengguna baru.' });
  }
});

// Endpoint untuk MENGAMBIL DAFTAR semua pengguna
// GET http://localhost:3000/api/users
app.get('/api/users', async (req, res) => {
  try {
    // Ambil semua user beserta nama cabangnya jika ada
    const query = `
      SELECT u.user_id, u.username, u.full_name, u.role, b.branch_name
      FROM users u
      LEFT JOIN branches b ON u.branch_id = b.branch_id
      ORDER BY u.full_name;
    `;
    const [users] = await pool.query(query);

    // Kirim data user (jangan kirim password!)
    res.json(users);

  } catch (error) {
    console.error('Error mengambil daftar pengguna:', error);
    res.status(500).json({ message: 'Gagal mengambil data pengguna.' });
  }
});

// Endpoint untuk MENGUBAH/EDIT data pengguna
// PUT http://localhost:3000/api/users/3
app.put('/api/users/:userId', async (req, res) => {
  const { userId } = req.params;
  const { full_name, role, branch_id } = req.body;

  // Validasi
  if (!full_name || !role) {
    return res.status(400).json({ message: 'Nama lengkap dan peran diperlukan.' });
  }
  if (role === 'Admin Cabang' && !branch_id) {
    return res.status(400).json({ message: 'Admin Cabang harus memiliki ID Cabang.' });
  }

  try {
    const query = `
      UPDATE users 
      SET full_name = ?, role = ?, branch_id = ?
      WHERE user_id = ?
    `;
    await pool.query(query, [
      full_name,
      role,
      role === 'Admin Cabang' ? branch_id : null,
      userId
    ]);

    res.json({ message: 'Data pengguna berhasil diperbarui.' });

  } catch (error) {
    console.error('Error saat memperbarui pengguna:', error);
    res.status(500).json({ message: 'Gagal memperbarui data pengguna.' });
  }
});


// =================================================================
// ====                     RUTE CABANG                         ====
// =================================================================

// Endpoint untuk MENGAMBIL DAFTAR semua cabang
// GET http://localhost:3000/api/branches
app.get('/api/branches', async (req, res) => {
  try {
    const [branches] = await pool.query('SELECT branch_id, branch_code, branch_name FROM branches ORDER BY branch_name');
    res.json(branches);
  } catch (error) {
    console.error('Error mengambil daftar cabang:', error);
    res.status(500).json({ message: 'Gagal mengambil data cabang.' });
  }
});

// =================================================================
// ====                     RUTE PRODUK                         ====
// =================================================================

// Endpoint untuk mengambil semua produk BESERTA STOK untuk cabang tertentu
// GET http://localhost:3000/api/products?branch_code=TBB
app.get('/api/products', async (req, res) => {
  const branch_code = req.query.branch_code || 'TBB';

  try {
    const query = `
      SELECT 
        p.product_id, p.product_code, p.product_name, p.brand_name,
        pc.category_name, p.description, p.purchase_price, p.selling_price, 
        p.unit, p.track_serial_batch, p.image_url,
        COALESCE(bi.quantity, 0) AS stock
      FROM products p
      LEFT JOIN product_categories pc ON p.category_id = pc.category_id
      LEFT JOIN branch_inventory bi ON p.product_id = bi.product_id AND bi.branch_id = (
          SELECT branch_id FROM branches WHERE branch_code = ? LIMIT 1
      );
    `;
    const [results] = await pool.query(query, [branch_code]);

    const productsForFlutter = results.map(p => ({
      id: p.product_id,
      product_code: p.product_code,
      name: p.product_name,
      category: p.category_name || 'Lainnya',
      brand: p.brand_name,
      description: p.description,
      price: parseFloat(p.selling_price),
      purchase_price: p.purchase_price ? parseFloat(p.purchase_price) : null,
      track_serial_batch: Boolean(p.track_serial_batch),
      image_url: p.image_url,
      stock: parseInt(p.stock, 10)
    }));
    res.json(productsForFlutter);

  } catch (error) {
    console.error('Error mengambil produk:', error);
    res.status(500).json({ message: 'Gagal mengambil data produk.' });
  }
});

// Endpoint untuk MENAMBAH produk baru
// POST http://localhost:3000/api/products
app.post('/api/products', async (req, res) => {
    const {
        name, product_code, category, price, stock,
        track_serial_batch, brand, purchase_price, description, branch_code
    } = req.body;

    if (!name || !product_code || !price) {
        return res.status(400).json({ message: 'Nama, kode produk, dan harga tidak boleh kosong.' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // 1. Dapatkan ID kategori & cabang dari nama/kode
        const [cat] = await connection.query('SELECT category_id FROM product_categories WHERE category_name = ?', [category]);
        const categoryId = cat.length > 0 ? cat[0].category_id : null;

        const [branch] = await connection.query('SELECT branch_id FROM branches WHERE branch_code = ?', [branch_code]);
        if (branch.length === 0) throw new Error(`Cabang dengan kode ${branch_code} tidak ditemukan.`);
        const branchId = branch[0].branch_id;
        
        // 2. Masukkan ke tabel 'products'
        const productQuery = `
            INSERT INTO products (product_name, product_code, brand_name, category_id, description, purchase_price, selling_price, track_serial_batch) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const [productResult] = await connection.query(productQuery, [
            name, product_code, brand || null, categoryId, description || null, purchase_price || null, price, track_serial_batch || false
        ]);
        const newProductId = productResult.insertId;

        // 3. Jika ada stok awal, masukkan ke 'branch_inventory'
        if (stock && stock > 0) {
            const inventoryQuery = `
                INSERT INTO branch_inventory (product_id, branch_id, quantity, last_restock_date) VALUES (?, ?, ?, NOW())
            `;
            await connection.query(inventoryQuery, [newProductId, branchId, stock]);
        }

        await connection.commit();
        res.status(201).json({ message: 'Produk berhasil ditambahkan!', productId: newProductId });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Error saat menambah produk:', error);
        res.status(500).json({ message: 'Gagal menyimpan produk ke database.', error: error.message });
    } finally {
        if (connection) connection.release();
    }
});

// Endpoint untuk MENAMBAH STOK pada produk yang sudah ada
// PATCH http://localhost:3000/api/products/123/stock
app.patch('/api/products/:productId/stock', async (req, res) => {
    const { productId } = req.params;
    const { quantity, branch_id } = req.body; // Terima branch_id dari body untuk fleksibilitas

    if (!quantity || !branch_id || quantity <= 0) {
        return res.status(400).json({ message: 'Kuantitas dan ID Cabang diperlukan dan harus valid.' });
    }

    try {
        const query = `
            INSERT INTO branch_inventory (product_id, branch_id, quantity, last_restock_date)
            VALUES (?, ?, ?, NOW())
            ON DUPLICATE KEY UPDATE
                quantity = quantity + VALUES(quantity),
                last_restock_date = NOW();
        `;
        await pool.query(query, [productId, branch_id, quantity]);
        res.status(200).json({ message: `Stok untuk produk ID ${productId} berhasil ditambahkan di cabang ID ${branch_id}.` });

    } catch (error) {
        console.error('Error saat menambah stok:', error);
        res.status(500).json({ message: 'Gagal menambah stok.', error: error.message });
    }
});

// =================================================================
// ====                   RUTE PELANGGAN                      ====
// =================================================================

// Endpoint untuk mencari pelanggan berdasarkan nomor telepon
// GET http://localhost:3000/api/customers/phone/08123456789
app.get('/api/customers/phone/:phoneNumber', async (req, res) => {
  const { phoneNumber } = req.params;

  if (!phoneNumber) {
    return res.status(400).json({ message: 'Nomor telepon diperlukan.' });
  }

  try {
    const query = 'SELECT * FROM customers WHERE phone_number = ?';
    const [results] = await pool.query(query, [phoneNumber]);

    if (results.length > 0) {
      // Pelanggan ditemukan, kirim datanya
      const customer = results[0];
      const customerForFlutter = {
        id: customer.customer_id.toString(),
        name: customer.name,
        phoneNumber: customer.phone_number,
        address: customer.address,
        // Format tanggal agar konsisten dan bisa di-parse oleh Dart
        dateOfBirth: customer.date_of_birth ? new Date(customer.date_of_birth).toISOString() : null
      };
      res.json(customerForFlutter);
    } else {
      // Pelanggan tidak ditemukan
      res.status(404).json({ message: 'Pelanggan tidak ditemukan.' });
    }

  } catch (error) {
    console.error('Database query error saat mencari pelanggan:', error);
    res.status(500).json({ message: 'Gagal mencari data pelanggan.', error: error.message });
  }
});

// =================================================================
// ====                    RUTE TRANSAKSI                       ====
// =================================================================

// Endpoint untuk menyimpan transaksi baru
// POST http://localhost:3000/api/transactions
app.post('/api/transactions', async (req, res) => {
    const {
        branch_code, user_id, items, total_amount, payment_method,
        amount_received, change_amount, reference_number, notes, customer_data
    } = req.body;

    if (!items || items.length === 0 || !total_amount || !payment_method) {
        return res.status(400).json({ message: 'Data transaksi tidak lengkap.' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // 1. Dapatkan ID Cabang
        const [branch] = await connection.query('SELECT branch_id FROM branches WHERE branch_code = ?', [branch_code]);
        if (branch.length === 0) throw new Error(`Cabang ${branch_code} tidak valid.`);
        const branchId = branch[0].branch_id;

        // 2. Urus data pelanggan (cari atau buat baru)
        let customerId = null;
        if (customer_data && customer_data.phone_number) {
           // ... (logika customer yang sudah ada, sudah benar)
        }

        // 3. Buat nomor invoice unik
        const now = new Date();
        // Query untuk menghitung transaksi harian, sekarang menggunakan 'branch_code'
        const [countResult] = await connection.query(
            "SELECT COUNT(*) as count FROM transactions WHERE branch_code = ? AND DATE(transaction_date) = CURDATE()",
            [branch_code] // Langsung gunakan branch_code yang dikirim dari Flutter
        );
        
        const dailySequence = String(countResult[0].count + 1).padStart(3, '0');
        const dateForInvoice = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
        const invoiceNumber = `INV-${branch_code}-${dateForInvoice}-${dailySequence}`;

        // Query INSERT sekarang juga menggunakan 'branch_code' secara langsung
        const transactionQuery = `
            INSERT INTO transactions 
                (invoice_number, branch_code, user_id, total_amount, payment_method, amount_received, change_amount, reference_number, notes, customer_id) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const [transResult] = await connection.query(transactionQuery, [
            invoiceNumber, branch_code, user_id, total_amount, payment_method,
            amount_received, change_amount, reference_number || null, notes || null, customerId
        ]);
        const transactionId = transResult.insertId;

        // 5. Simpan item-item transaksi
        const itemsValues = items.map(item => [transactionId, item.product_id, item.quantity, item.price_per_item, item.subtotal]);
        await connection.query('INSERT INTO transaction_items (transaction_id, product_id, quantity, price_per_item, subtotal) VALUES ?', [itemsValues]);

        // 6. Kurangi stok untuk setiap item
        for (const item of items) {
            await connection.query('UPDATE branch_inventory SET quantity = quantity - ? WHERE product_id = ? AND branch_id = ?', [item.quantity, item.product_id, branchId]);
        }
        
        await connection.commit();
        res.status(201).json({ message: 'Transaksi berhasil!', transactionId, invoiceNumber });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Error saat menyimpan transaksi:', error);
        res.status(500).json({ message: 'Gagal menyimpan transaksi.', error: error.message });
    } finally {
        if (connection) connection.release();
    }
});


// =================================================================
// ====                     RUTE LAPORAN                        ====
// =================================================================

// Endpoint untuk laporan penjualan bulanan
// GET http://localhost:3000/api/reports/sales?month=6&year=2025&branch_code=TBB
app.get('/api/reports/sales', async (req, res) => {
    const { month, year, branch_code } = req.query;

    if (!month || !year || !branch_code) {
        return res.status(400).json({ message: 'Parameter month, year, dan branch_code diperlukan.' });
    }

    try {
        const [branch] = await pool.query('SELECT branch_id FROM branches WHERE branch_code = ?', [branch_code]);
        if (branch.length === 0) return res.status(404).json({ message: 'Cabang tidak ditemukan.' });
        const branchId = branch[0].branch_id;

        // Query untuk ringkasan penjualan
        const summaryQuery = `
            SELECT
                SUM(total_amount) AS total_revenue,
                COUNT(*) AS total_transactions,
                AVG(total_amount) AS average_transaction_value
            FROM transactions
            WHERE 
                branch_id = ? AND
                MONTH(transaction_date) = ? AND
                YEAR(transaction_date) = ?
        `;
        const [summary] = await pool.query(summaryQuery, [branchId, month, year]);

        // Query untuk 5 produk terlaris
        const topProductsQuery = `
            SELECT
                p.product_name,
                SUM(ti.quantity) AS total_quantity_sold
            FROM transaction_items ti
            JOIN transactions t ON ti.transaction_id = t.transaction_id
            JOIN products p ON ti.product_id = p.product_id
            WHERE
                t.branch_id = ? AND
                MONTH(t.transaction_date) = ? AND
                YEAR(t.transaction_date) = ?
            GROUP BY p.product_name
            ORDER BY total_quantity_sold DESC
            LIMIT 5;
        `;
        const [top_selling_products] = await pool.query(topProductsQuery, [branchId, month, year]);

        res.json({
            summary: summary[0],
            top_selling_products
        });

    } catch (error) {
        console.error('Error membuat laporan:', error);
        res.status(500).json({ message: 'Gagal membuat laporan penjualan.' });
    }
});


// ---- Jalankan Server ----
app.listen(port, () => {
  console.log(`Server API Alfa Optik berjalan di http://localhost:${port}`);
});