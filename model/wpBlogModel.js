const mongoose = require("mongoose");
const { Schema } = mongoose;
const { extractAndUploadBase64Images } = require("../utils/imageOptimizer");


const wpbloglogSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },
    titleForInnerPage: {
      type: String,
      trim: true
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true
    },
    metaTitle: {
      type: String,
      trim: true
    },
    metaDescription: {
      type: String,
      trim: true
    },
    imageAltText: {
      type: String,
      trim: true
    },
    content: {
      type: String,
      required: true
    },
    primaryImage: {
      type: String,
      required: true
    },
    isActive: {
      type: Boolean,
      default: true
    },

  },
  { timestamps: true }
);

// Auto-optimize images before saving
wpbloglogSchema.pre('save', async function (next) {
  if (this.isModified('content') && this.content && this.content.includes('data:image')) {
    console.log('🔄 Optimizing images in blog content...');
    this.content = await extractAndUploadBase64Images(this.content);
  }
  next();
});

// Pre-save middleware to generate slug from title if not provided
wpbloglogSchema.pre('save', function (next) {
  if (!this.slug) {
    if (this.title) {
      this.slug = this.title
        .toLowerCase()
        .replace(/[^\w\s-]/g, '') // Remove special characters
        .replace(/\s+/g, '-')     // Replace spaces with hyphens
        .replace(/-+/g, '-')      // Replace multiple hyphens with single
        .replace(/^-+|-+$/g, '')
        .trim();
    }
  } else {
    this.slug = this.slug
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .trim();
  }
  next();
});

// Add indexes for better performance
wpbloglogSchema.index({ slug: 1 });
wpbloglogSchema.index({ isActive: 1, createdAt: -1 });


const WpBlog = mongoose.model("WpBlog", wpbloglogSchema);

module.exports = WpBlog;