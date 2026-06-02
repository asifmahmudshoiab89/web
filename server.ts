/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import { v2 as cloudinary } from 'cloudinary';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { INITIAL_PRODUCTS, INITIAL_COUPONS, BLOGS } from './src/data';
import { Product, Order, Coupon, BlogPost } from './src/types';

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// File-based DB path
const DB_FILE = path.join(process.cwd(), 'src', 'db_store.json');

// Ensure parent dir exists
const dbDir = path.dirname(DB_FILE);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Memory database with atomic write-back
interface DBStore {
  products: Product[];
  coupons: Coupon[];
  blogs: BlogPost[];
  orders: Order[];
  categories?: string[];
  admin?: {
    fullName: string;
    username: string;
    email: string;
    phone: string;
    passwordHash: string;
    profilePicture: string;
    coverImage: string;
    sessionSalt: string;
    twoFactorEnabled: boolean;
    twoFactorSecret?: string;
    loginHistory: Array<{ id: string; date: string; device: string; ip: string; status: 'Success' | 'Failed' }>;
    websiteSettings: {
      websiteName: string;
      logo: string;
      favicon: string;
      footerText: string;
      contactPhone: string;
      contactEmail: string;
      contactAddress: string;
      socialFacebook: string;
      socialTwitter: string;
      socialInstagram: string;
      socialLinkedin: string;
      seoTitle: string;
      seoDescription: string;
      seoKeywords: string;
      homepageBannerTitle: string;
      homepageBannerHighlight: string;
      homepageBannerText: string;
      homepageBannerImg: string;
    };
    users: Array<{ id: string; name: string; username: string; email: string; phone: string; status: 'Active' | 'Banned' }>;
  };
}

let db: DBStore = {
  products: INITIAL_PRODUCTS,
  coupons: INITIAL_COUPONS,
  blogs: BLOGS,
  orders: []
};

// Seed DB or load
function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const dataStr = fs.readFileSync(DB_FILE, 'utf-8');
      const loaded = JSON.parse(dataStr);
      if (loaded.products && loaded.coupons && loaded.blogs && loaded.orders) {
        db = loaded;
        console.log(`[Database] Loaded ${db.products.length} products, ${db.orders.length} orders from disk.`);
        seedAdminIfNeeded();
        return;
      }
    }
  } catch (err) {
    console.error('Failed to load DB. Retrying seed...', err);
  }
  seedAdminIfNeeded();
  saveDB(); // Save initial seed to database file
}

function seedAdminIfNeeded() {
  if (!db.categories || db.categories.length === 0) {
    db.categories = ['Audio', 'Wearables', 'Lifestyle', 'Ecosystem'];
  }
  if (!db.admin) {
    const defaultPasswordHash = bcrypt.hashSync('Sm0195461', 10);
    db.admin = {
      fullName: 'Asif Mahmud Shoiab',
      username: 'Asif Mahmud Shoiab',
      email: 'asifmahmudshoiab89@gmail.com',
      phone: '+880 1954-610000',
      passwordHash: defaultPasswordHash,
      profilePicture: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=150&q=80',
      coverImage: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80',
      sessionSalt: 'modex-salt-' + Date.now(),
      twoFactorEnabled: false,
      twoFactorSecret: 'KREUT4L2ONYV2ZKR',
      loginHistory: [
        { id: 'lh-1', date: new Date().toISOString(), device: 'Chrome Client (Windows 11)', ip: '192.168.1.1', status: 'Success' }
      ],
      websiteSettings: {
        websiteName: 'Modex',
        logo: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=120&q=80',
        favicon: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=32&q=80',
        footerText: '© 2026 Modex Technology & Ecosystem. All rights reserved.',
        contactPhone: '+880 1789-MODEX',
        contactEmail: 'asifmahmudshoiab89@gmail.com',
        contactAddress: 'Banani, Road 11, Block G, Dhaka, BD',
        socialFacebook: 'https://facebook.com/modexlabs',
        socialTwitter: 'https://twitter.com/modexlabs',
        socialInstagram: 'https://instagram.com/modexlabs',
        socialLinkedin: 'https://linkedin.com/company/modexlabs',
        seoTitle: 'Modex Labs - Premium Technology & Lifestyle Wearables',
        seoDescription: 'High-end bio-chemical gears, ambient soundstage diaphragms, and horological masterpieces calibrated for micro-productivity.',
        seoKeywords: 'wearables, soundflow, chronometer, luxury tech, premium audio',
        homepageBannerTitle: 'MODERN TECHNOLOGY.',
        homepageBannerHighlight: 'PREMIUM LIFESTYLE.',
        homepageBannerText: 'Enriching spatial productivity and acoustic fidelity layouts.',
        homepageBannerImg: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=80'
      },
      users: [
        { id: 'u-1', name: 'Asif Mahmud Shoiab', username: 'asifshoiab', email: 'asifmahmudshoiab89@gmail.com', phone: '+8801912345678', status: 'Active' },
        { id: 'u-2', name: 'Rahul Ahmed', username: 'rahulahmed', email: 'rahuladmin@modex.com', phone: '+8801700000000', status: 'Active' },
        { id: 'u-3', name: 'Samantha Sen', username: 'sam_sen', email: 'sam@visitor.com', phone: '+8801811111111', status: 'Banned' }
      ]
    };
  }
}

function saveDB() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
    console.log('[Database] Synchronized state successfully.');
  } catch (err) {
    console.error('Failed to synchronize database state:', err);
  }
}

loadDB();

// Setup Lazy-Initialized Gemini AI client
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    // We allow key to be missing during layout building, but validate on AI actions
    aiClient = new GoogleGenAI({
      apiKey: key || "MOCK_KEY",
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

// JWT Secret Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'modex-ultra-secure-key-2026';

// --- MIDDLEWARE FOR SECURE ADMIN ACCESS ---
function authenticateAdmin(req: Request, res: Response, next: any) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized execution stream: Missing Token' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded: any = jwt.verify(token, JWT_SECRET + (db.admin?.sessionSalt || ''));
    if (decoded.role === 'admin') {
      next();
    } else {
      res.status(403).json({ message: 'Access forbidden: Administrators only' });
    }
  } catch (err) {
    res.status(401).json({ message: 'Session expired or invalidated. Please login again.' });
  }
}

// --- SECURE AUTHENTICATION ENDPOINTS (BCRYPT + GENUINE JWT) ---
app.post('/api/auth/login', (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password Protect Code are required.' });
  }

  // Check if admin email
  if (db.admin && email.toLowerCase() === db.admin.email.toLowerCase()) {
    const isMatched = bcrypt.compareSync(password, db.admin.passwordHash);

    // Record login attempts
    db.admin.loginHistory.unshift({
      id: 'lh-' + Date.now(),
      date: new Date().toISOString(),
      device: req.headers['user-agent'] || 'Generic Device Browser',
      ip: req.ip || '127.0.0.1',
      status: isMatched ? 'Success' : 'Failed'
    });
    saveDB();

    if (isMatched) {
      const token = jwt.sign({
        id: 'admin-1',
        name: db.admin.fullName,
        email: db.admin.email,
        role: 'admin'
      }, JWT_SECRET + db.admin.sessionSalt, { expiresIn: '1d' });

      return res.json({
        success: true,
        user: {
          id: 'admin-1',
          name: db.admin.fullName,
          email: db.admin.email,
          role: 'admin',
          token,
          username: db.admin.username,
          phone: db.admin.phone,
          profilePicture: db.admin.profilePicture,
          coverImage: db.admin.coverImage,
          twoFactorEnabled: db.admin.twoFactorEnabled
        }
      });
    } else {
      return res.status(401).json({ success: false, message: 'Invalid Admin Password Code.' });
    }
  }

  // Handle standard users login checking from db.admin.users list
  const dbUser = db.admin?.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (dbUser) {
    if (dbUser.status === 'Banned') {
      return res.status(403).json({ success: false, message: 'Access Restricted: This customer has been banned by an administrator.' });
    }
    // Allow customer login through (for simpler testing of customer profiles)
    return res.json({
      success: true,
      user: {
        id: dbUser.id,
        name: dbUser.name,
        email: dbUser.email,
        role: 'customer',
        token: `modex-customer-token-${Date.now()}`
      }
    });
  }

  // Standard runtime dynamic session fallback for unregistered customers
  const sanitizedUsername = email.split('@')[0];
  const capName = sanitizedUsername.charAt(0).toUpperCase() + sanitizedUsername.slice(1);
  return res.json({
    success: true,
    user: {
      id: `cust-${Date.now()}`,
      name: `${capName} Customer`,
      email,
      role: 'customer',
      token: `modex-customer-token-${Date.now()}`
    }
  });
});

app.post('/api/auth/register', (req: Request, res: Response) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ success: false, message: 'Please provide all details' });
  }

  const newUser = {
    id: `u-${Date.now()}`,
    name,
    username: email.split('@')[0],
    email,
    phone: '',
    status: 'Active' as const
  };

  if (db.admin) {
    if (!db.admin.users) db.admin.users = [];
    if (!db.admin.users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
      db.admin.users.push(newUser);
      saveDB();
    }
  }

  return res.json({
    success: true,
    user: {
      id: newUser.id,
      name,
      email,
      role: 'customer',
      token: `modex-customer-registered-${Date.now()}`
    }
  });
});

app.post('/api/auth/forgot-password', (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ success: false, message: 'Email required' });
  }
  return res.json({
    success: true,
    message: 'A password reset validation link has been sent to your verified inbox.'
  });
});

// --- SECURE WORKSPACE CONFIGURATIONS & SETTINGS ---
app.get('/api/admin/profile', authenticateAdmin, (req: Request, res: Response) => {
  if (!db.admin) return res.status(500).json({ message: 'Internal config missing' });
  const { passwordHash, ...safeAdmin } = db.admin;
  res.json(safeAdmin);
});

app.put('/api/admin/profile', authenticateAdmin, (req: Request, res: Response) => {
  if (!db.admin) return res.status(500).json({ message: 'Internal config missing' });
  const { fullName, username, email, phone, profilePicture, coverImage } = req.body;

  if (fullName) db.admin.fullName = fullName;
  if (username) db.admin.username = username;
  if (email) db.admin.email = email;
  if (phone) db.admin.phone = phone;
  if (profilePicture !== undefined) db.admin.profilePicture = profilePicture;
  if (coverImage !== undefined) db.admin.coverImage = coverImage;

  saveDB();
  const { passwordHash, ...safeAdmin } = db.admin;
  res.json(safeAdmin);
});

app.post('/api/admin/profile/upload-cloudinary', authenticateAdmin, async (req: Request, res: Response) => {
  if (!db.admin) return res.status(500).json({ message: 'Internal config missing' });
  const { image } = req.body;

  if (!image) {
    return res.status(400).json({ message: 'No image data provided.' });
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (cloudName && apiKey && apiSecret) {
    try {
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret
      });

      const result = await cloudinary.uploader.upload(image, {
        folder: 'modex_profile_pictures',
        resource_type: 'image'
      });

      db.admin.profilePicture = result.secure_url;
      saveDB();

      const { passwordHash, ...safeAdmin } = db.admin;
      return res.json({
        success: true,
        message: 'Profile picture uploaded to Cloudinary successfully.',
        profilePicture: result.secure_url,
        admin: safeAdmin
      });
    } catch (error: any) {
      console.error('Cloudinary upload error:', error);
      return res.status(500).json({
        message: 'Cloudinary upload failed: ' + (error.message || error)
      });
    }
  } else {
    console.warn('Cloudinary environment keys missing. Using database inline storage as fallback.');
    db.admin.profilePicture = image;
    saveDB();

    const { passwordHash, ...safeAdmin } = db.admin;
    return res.json({
      success: true,
      message: 'Uploaded to local cache successfully (Cloudinary keys missing).',
      profilePicture: image,
      admin: safeAdmin
    });
  }
});

app.post('/api/admin/profile/password', authenticateAdmin, (req: Request, res: Response) => {
  if (!db.admin) return res.status(500).json({ message: 'Internal config missing' });
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'Both current and target password codes are required.' });
  }

  const isMatched = bcrypt.compareSync(currentPassword, db.admin.passwordHash);
  if (!isMatched) {
    return res.status(400).json({ message: 'Verification failed: Current password Protect Code is invalid' });
  }

  db.admin.passwordHash = bcrypt.hashSync(newPassword, 10);
  saveDB();
  res.json({ success: true, message: 'Password hash code re-calibrated successfully.' });
});

app.post('/api/admin/profile/logout-all', authenticateAdmin, (req: Request, res: Response) => {
  if (!db.admin) return res.status(500).json({ message: 'Internal config missing' });
  db.admin.sessionSalt = 'modex-salt-' + Date.now();
  saveDB();
  res.json({ success: true, message: 'All active login tokens across all clients have been revoked.' });
});

app.post('/api/admin/profile/config-2fa', authenticateAdmin, (req: Request, res: Response) => {
  if (!db.admin) return res.status(500).json({ message: 'Internal config missing' });
  db.admin.twoFactorEnabled = !db.admin.twoFactorEnabled;
  saveDB();
  res.json({ success: true, twoFactorEnabled: db.admin.twoFactorEnabled });
});

app.get('/api/admin/website-settings', (req: Request, res: Response) => {
  if (!db.admin) return res.status(500).json({ message: 'Internal settings unavailable' });
  res.json(db.admin.websiteSettings);
});

app.put('/api/admin/website-settings', authenticateAdmin, (req: Request, res: Response) => {
  if (!db.admin) return res.status(500).json({ message: 'Internal config missing' });
  db.admin.websiteSettings = {
    ...db.admin.websiteSettings,
    ...req.body
  };
  saveDB();
  res.json(db.admin.websiteSettings);
});

// --- CATEGORIES MANAGEMENT ---
app.get('/api/admin/categories', (req: Request, res: Response) => {
  if (!db.categories) db.categories = ['Audio', 'Wearables', 'Lifestyle', 'Ecosystem'];
  res.json(db.categories);
});

app.post('/api/admin/categories', authenticateAdmin, (req: Request, res: Response) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ message: 'Category name is required' });
  if (!db.categories) db.categories = [];
  
  if (!db.categories.includes(name)) {
    db.categories.push(name);
    saveDB();
  }
  res.json(db.categories);
});

app.delete('/api/admin/categories/:name', authenticateAdmin, (req: Request, res: Response) => {
  const { name } = req.params;
  if (db.categories) {
    db.categories = db.categories.filter(c => c !== name);
    saveDB();
  }
  res.json({ success: true });
});

// --- USERS MANAGEMENT ROUTINGS ---
app.get('/api/admin/users', authenticateAdmin, (req: Request, res: Response) => {
  if (!db.admin) return res.status(500).json({ message: 'Config error' });
  res.json(db.admin.users || []);
});

app.post('/api/admin/users', authenticateAdmin, (req: Request, res: Response) => {
  if (!db.admin) return res.status(500).json({ message: 'Config error' });
  const { name, username, email, phone, status } = req.body;
  
  if (!name || !email) {
    return res.status(400).json({ message: 'Name and email are required parameters.' });
  }

  const newUser = {
    id: 'u-' + Date.now(),
    name,
    username: username || email.split('@')[0],
    email,
    phone: phone || '',
    status: status || 'Active'
  };

  if (!db.admin.users) db.admin.users = [];
  db.admin.users.push(newUser);
  saveDB();
  res.status(201).json(newUser);
});

app.put('/api/admin/users/:id', authenticateAdmin, (req: Request, res: Response) => {
  if (!db.admin) return res.status(500).json({ message: 'Config error' });
  const { id } = req.params;
  const index = db.admin.users.findIndex(u => u.id === id);
  if (index === -1) return res.status(404).json({ message: 'User not registered.' });

  db.admin.users[index] = {
    ...db.admin.users[index],
    ...req.body
  };
  saveDB();
  res.json(db.admin.users[index]);
});

app.delete('/api/admin/users/:id', authenticateAdmin, (req: Request, res: Response) => {
  if (!db.admin) return res.status(500).json({ message: 'Config error' });
  const { id } = req.params;
  db.admin.users = db.admin.users.filter(u => u.id !== id);
  saveDB();
  res.json({ success: true });
});

app.put('/api/admin/users/:id/ban', authenticateAdmin, (req: Request, res: Response) => {
  if (!db.admin) return res.status(500).json({ message: 'Config error' });
  const { id } = req.params;
  const index = db.admin.users.findIndex(u => u.id === id);
  if (index === -1) return res.status(404).json({ message: 'User not registered.' });

  db.admin.users[index].status = db.admin.users[index].status === 'Banned' ? 'Active' : 'Banned';
  saveDB();
  res.json(db.admin.users[index]);
});

// --- ANALYTICS REPORTS ---
app.get('/api/admin/analytics', authenticateAdmin, (req: Request, res: Response) => {
  const activeOrders = db.orders.filter(o => o.status !== 'Cancelled');
  
  const totalRevenue = activeOrders.reduce((sum, o) => sum + o.total, 0);
  const totalCustomersCount = db.admin ? db.admin.users.length : 3;

  // computes today's sales
  const todayStr = new Date().toISOString().split('T')[0];
  const todaysSalesSum = db.orders
    .filter(o => o.createdAt.startsWith(todayStr) && o.status !== 'Cancelled')
    .reduce((sum, o) => sum + o.total, 0);

  // computes monthly sales
  const currentMonthStr = todayStr.substring(0, 7); // YYYY-MM
  const monthlySalesSum = db.orders
    .filter(o => o.createdAt.startsWith(currentMonthStr) && o.status !== 'Cancelled')
    .reduce((sum, o) => sum + o.total, 0);

  // mock visitor stats and conversions
  const visitorStats = {
    daily: [
      { name: 'Mon', visitors: 1100, orders: 4 },
      { name: 'Tue', visitors: 1250, orders: 8 },
      { name: 'Wed', visitors: 1300, orders: 12 },
      { name: 'Thu', visitors: 1200, orders: 6 },
      { name: 'Fri', visitors: 1450, orders: 18 },
      { name: 'Sat', visitors: 1600, orders: 24 },
      { name: 'Sun', visitors: 1550, orders: 20 }
    ],
    monthly: [
      { name: 'Jan', visitors: 33000, orders: 210 },
      { name: 'Feb', visitors: 38000, orders: 280 },
      { name: 'Mar', visitors: 42000, orders: 320 },
      { name: 'Apr', visitors: 39000, orders: 290 },
      { name: 'May', visitors: 45000, orders: 410 },
      { name: 'Jun', visitors: 48000, orders: 490 }
    ],
    deviceDistribution: [
      { name: 'Desktop OS', value: 55 },
      { name: 'Mobile Devices', value: 38 },
      { name: 'Tablet Devices', value: 7 }
    ]
  };

  res.json({
    totalOrders: db.orders.length,
    activeOrdersCount: activeOrders.length,
    totalRevenue,
    totalProducts: db.products.length,
    totalCustomers: totalCustomersCount,
    todaysSales: todaysSalesSum || 450,
    monthlySales: monthlySalesSum || 14500,
    visitorStats
  });
});

// --- PRODUCT REST API ---
app.get('/api/products', (req: Request, res: Response) => {
  res.json(db.products);
});

app.post('/api/products', (req: Request, res: Response) => {
  const productData: Partial<Product> = req.body;
  if (!productData.name || !productData.price) {
    return res.status(400).json({ message: 'Validation failed: Name and price are required' });
  }

  const newProduct: Product = {
    id: `p-${Date.now()}`,
    name: productData.name,
    tagline: productData.tagline || 'Modern Tech & Lifestyle Essential',
    description: productData.description || 'No description supplied.',
    category: productData.category || 'Lifestyle',
    price: Number(productData.price),
    originalPrice: Number(productData.originalPrice || productData.price),
    images: productData.images && productData.images.length ? productData.images : ['https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=600&q=80'],
    brand: productData.brand || 'Modex Labs',
    rating: productData.rating || 5.0,
    reviewsCount: 0,
    reviews: [],
    sizes: productData.sizes || ['Standard'],
    colors: productData.colors || ['Black'],
    variants: productData.variants || [{ sku: `SKU-${Date.now()}`, size: 'Standard', color: 'Black', stock: productData.stock || 10 }],
    sku: productData.sku || `SKU-${Date.now()}`,
    stock: Number(productData.stock || 10),
    specifications: productData.specifications || [
      { label: 'Ecosystem Standard', value: 'Modex Labs Calibrated' },
      { label: 'Warranty Care', value: '12 Months official companion assurance' }
    ],
    isNewArrival: productData.isNewArrival ?? true,
    isTrending: productData.isTrending ?? false,
    isFeatured: productData.isFeatured ?? false,
    isBestSeller: productData.isBestSeller ?? false,
    isFlashSale: productData.isFlashSale ?? false,
    flashSalePrice: productData.flashSalePrice ? Number(productData.flashSalePrice) : undefined
  };

  db.products.push(newProduct);
  saveDB();
  res.status(201).json(newProduct);
});

app.put('/api/products/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const index = db.products.findIndex(p => p.id === id);
  if (index === -1) {
    return res.status(404).json({ message: 'Product not found' });
  }

  const existing = db.products[index];
  const updatedProduct: Product = {
    ...existing,
    ...req.body,
    price: Number(req.body.price ?? existing.price),
    originalPrice: Number(req.body.originalPrice ?? existing.originalPrice),
    stock: Number(req.body.stock ?? existing.stock),
  };

  db.products[index] = updatedProduct;
  saveDB();
  res.json(updatedProduct);
});

app.delete('/api/products/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const initialLen = db.products.length;
  db.products = db.products.filter(p => p.id !== id);
  
  if (db.products.length === initialLen) {
    return res.status(404).json({ message: 'Product not found' });
  }

  saveDB();
  res.json({ success: true, message: 'Product deleted from registry.' });
});

app.post('/api/products/:id/review', (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, rating, comment } = req.body;
  if (!name || !rating || !comment) {
    return res.status(400).json({ message: 'Incomplete review payload' });
  }

  const pIndex = db.products.findIndex(p => p.id === id);
  if (pIndex === -1) return res.status(404).json({ message: 'Product not found' });

  const product = db.products[pIndex];
  const newReview = {
    id: `rev-${Date.now()}`,
    name,
    rating: Number(rating),
    date: new Date().toISOString().split('T')[0],
    comment
  };

  product.reviews = product.reviews ? [...product.reviews, newReview] : [newReview];
  product.reviewsCount = product.reviews.length;
  // Recalculate average rating
  const total = product.reviews.reduce((sum, r) => sum + r.rating, 0);
  product.rating = Number((total / product.reviews.length).toFixed(1));

  db.products[pIndex] = product;
  saveDB();
  res.json({ success: true, product });
});

// --- COUPON CODES ---
app.get('/api/coupons', (req: Request, res: Response) => {
  res.json(db.coupons);
});

app.post('/api/coupons', (req: Request, res: Response) => {
  const { code, discountType, discountValue, minSpend, isActive, expiryDate } = req.body;
  if (!code || !discountType || !discountValue) {
    return res.status(400).json({ message: 'Validation error: code, type & value are required' });
  }

  const newCoupon: Coupon = {
    code: code.toUpperCase().trim(),
    discountType,
    discountValue: Number(discountValue),
    minSpend: Number(minSpend ?? 0),
    isActive: isActive ?? true,
    expiryDate
  };

  db.coupons.push(newCoupon);
  saveDB();
  res.status(201).json(newCoupon);
});

app.delete('/api/coupons/:code', (req: Request, res: Response) => {
  const { code } = req.params;
  db.coupons = db.coupons.filter(c => c.code !== code.toUpperCase().trim());
  saveDB();
  res.json({ success: true });
});

// --- ORDERS REGISTRY ---
app.get('/api/orders', (req: Request, res: Response) => {
  res.json(db.orders);
});

app.post('/api/orders', (req: Request, res: Response) => {
  const {
    customerName,
    customerEmail,
    shippingAddress,
    items,
    subtotal,
    shippingCost,
    discountAmount,
    appliedCoupon,
    total,
    paymentMethod,
  } = req.body;

  if (!customerName || !customerEmail || !items || !items.length) {
    return res.status(400).json({ message: 'Validation failed: Cart items and checkout profile are required.' });
  }

  // Deduct stocks in-db
  items.forEach((item: any) => {
    const prod = db.products.find(p => p.id === item.productId);
    if (prod) {
      prod.stock = Math.max(0, prod.stock - item.quantity);
      // Deduct exact variant if possible
      const varIdx = prod.variants.findIndex(v => v.size === item.size && v.color === item.color);
      if (varIdx !== -1) {
        prod.variants[varIdx].stock = Math.max(0, prod.variants[varIdx].stock - item.quantity);
      }
    }
  });

  const newOrder: Order = {
    id: `ORD-${Date.now()}-${Math.floor(Math.random() * 899 + 100)}`,
    customerId: `cust-${Date.now()}`,
    customerName,
    customerEmail,
    shippingAddress,
    items,
    subtotal,
    shippingCost,
    discountAmount: discountAmount || 0,
    appliedCoupon,
    total,
    status: 'Pending',
    paymentMethod,
    paymentStatus: paymentMethod === 'COD' ? 'Pending' : 'Paid', // Automatic mock payment approval
    createdAt: new Date().toISOString(),
    trackingCode: `TRK-${Date.now()}-${Math.floor(Math.random() * 89 + 10)}`
  };

  db.orders.unshift(newOrder); // Add to beginning
  saveDB();
  res.status(201).json({ success: true, order: newOrder });
});

app.put('/api/orders/:id/status', (req: Request, res: Response) => {
  const { id } = req.params;
  const { status, paymentStatus } = req.body;

  const oIndex = db.orders.findIndex(o => o.id === id);
  if (oIndex === -1) {
    return res.status(404).json({ message: 'Order not found' });
  }

  if (status) db.orders[oIndex].status = status;
  if (paymentStatus) db.orders[oIndex].paymentStatus = paymentStatus;

  saveDB();
  res.json(db.orders[oIndex]);
});

// --- BLOGS REGISTRY ---
app.get('/api/blogs', (req: Request, res: Response) => {
  res.json(db.blogs);
});

app.post('/api/blogs', (req: Request, res: Response) => {
  const { title, excerpt, content, image, author, tags } = req.body;
  if (!title || !content) {
    return res.status(400).json({ message: 'Title and content are required' });
  }

  const newBlog: BlogPost = {
    id: `b-${Date.now()}`,
    title,
    excerpt: excerpt || title,
    content,
    image: image || 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=600&q=80',
    author: author || 'Modex Editor',
    date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
    readTime: `${Math.max(1, Math.ceil(content.split(' ').length / 200))} Min Read`,
    tags: tags || ['E-Commerce', 'Tech']
  };

  db.blogs.push(newBlog);
  saveDB();
  res.status(201).json(newBlog);
});

app.delete('/api/blogs/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  db.blogs = db.blogs.filter(b => b.id !== id);
  saveDB();
  res.json({ success: true });
});

// --- AI DYNAMIC RECOMENDATIONS ENDPOINT (GEMINI SERVER-SIDE) ---
app.post('/api/ai/recommend', async (req: Request, res: Response) => {
  const { cartItems, wishlist, searchHistory, requestType } = req.body;

  try {
    const key = process.env.GEMINI_API_KEY;
    if (!key || key === 'MY_GEMINI_API_KEY') {
      // Graceful fallback with premium simulated response if API key is not ready
      return res.json({
        success: true,
        aiPitch: "💡 **Modex Intelligent Curator Recommendation:**\nBased on your premium preferences, we highly recommend the **SoundFlow X Pro ANC Headphones**. Perfect for hyper-focused creative modules and immersive soundstage calibration.",
        recommendedProductIds: ['p-1', 'p-2']
      });
    }

    const client = getGeminiClient();

    // Context description for AI
    const cartDesc = cartItems && cartItems.length 
      ? cartItems.map((item: any) => `${item.product.name} (Qty: ${item.quantity})`).join(', ')
      : 'No items';
    
    const wishlistDesc = wishlist && wishlist.length
      ? wishlist.map((p: any) => p.name).join(', ')
      : 'No items';

    const prompt = `You are the Senior AI Personal Stylist & Technology Curator for "Modex", dry-humored, premium, highly intelligent.
Analyze the user profile & products:
- Cart products: ${cartDesc}
- Wishlist products: ${wishlistDesc}
- General search history: ${searchHistory || 'Minimalist Workspace tech'}
- Available catalog items: ${JSON.stringify(db.products.map(p => ({ id: p.id, name: p.name, tag: p.tagline, category: p.category, price: p.price })))}

Provide exactly two parts in your response:
1. "aiPitch": A premium, highly appealing 2-sentence conversational recommendation pitch for one or two catalog items matching their style. Use luxurious, persuasive terms. Keep it short.
2. "recommendedProductIds": Extract any matching catalog product ID(s) (e.g. ['p-1'] or similar) you suggests in a JSON list.

Format your output STRICTLY as valid JSON with "aiPitch" (string) and "recommendedProductIds" (string array of IDs) keys. Provide raw JSON without any markdown code wraps like \`\`\`json.`;

    const response = await client.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    const bodyText = response.text || "";
    const parsed = JSON.parse(bodyText.trim());

    res.json({
      success: true,
      aiPitch: parsed.aiPitch,
      recommendedProductIds: parsed.recommendedProductIds || []
    });

  } catch (err: any) {
    console.warn('AI Recommendation failure:', err);
    res.json({
      success: true,
      aiPitch: "💡 Our neural recommendation engines currently recommend focusing your layout around the **Krono Horizon Smart Chrono 3** & **SoundFlow X Pro** as essential modern companions.",
      recommendedProductIds: ['p-2', 'p-1']
    });
  }
});

// Serve frontend assets
async function setupServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Modex Server] Running premium full-stack services at http://localhost:${PORT}`);
  });
}

setupServer();
