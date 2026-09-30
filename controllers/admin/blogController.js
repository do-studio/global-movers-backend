const Blog = require("../../model/blogModel");
const mongoose = require("mongoose");
const { extractAndUploadBase64Images } = require('../../utils/imageOptimizer');

// Getting all blogs to list on admin dashboard
const getBlogs = async (req, res) => {
  try {
    const {
      status,
      search,
      page = 1,
      limit = 130,
      startingDate,
      endingDate,
    } = req.query;


    const filter = {
      isActive: true,   // ✅ only active blogs
    };

    if (status !== undefined) {
      filter.isActive = status === 'true' || status === true;
    }
    if (search) {
      filter.name = { $regex: new RegExp(search, "i") };
    }
    const skip = (page - 1) * limit;

    // Date
    if (startingDate) {
      const date = new Date(startingDate);
      filter.createdAt = { $gte: date };
    }
    if (endingDate) {
      const date = new Date(endingDate);
      filter.createdAt = { ...filter.createdAt, $lte: date };
    }

    const blogs = await Blog.find(filter, {
      verticalImages: 0,
      horizontalImages: 0,
      content: 0,
    })
      .skip(skip)
      .limit(limit);

    const totalAvailableBlogs = await Blog.countDocuments(filter);

    res.status(200).json({ blogs, totalAvailableBlogs });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Get single Blog
const getBlog = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw Error("Invalid ID!!!");
    }

    const blog = await Blog.findOne({ _id: id });

    if (!blog) {
      throw Error("No Such Blog");
    }

    res.status(200).json({ blog });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Add a new blog
const addBlog = async (req, res) => {
  try {
    let formData = { ...req.body, isActive: true };

    // Get the file - try different ways it might be stored
    let primaryImageFile;
    if (req.file) {
      primaryImageFile = req.file;
    } else if (req.files && req.files.primaryImage) {
      primaryImageFile = Array.isArray(req.files.primaryImage)
        ? req.files.primaryImage[0]
        : req.files.primaryImage;
    }

    // ✅ Handle slug (use provided slug, or fallback to generating from title)
    let slug = "";
    if (formData.slug && typeof formData.slug === "string" && formData.slug.trim()) {
      slug = formData.slug
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "")
        .trim();
    } else if (formData.title && typeof formData.title === "string" && formData.title.trim()) {
      slug = formData.title
        .trim()
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "")
        .trim();
    }

    if (!slug) {
      throw Error("Slug or title is required to generate a slug.");
    }

    const slugExists = await Blog.findOne({ slug });
    if (slugExists) {
      throw Error("The Slug is already used. Please try another one.");
    }

    formData.slug = slug;

    if (formData.title && typeof formData.title === "string") {
      formData.title = formData.title.trim();
    }

    // ✅ Parse content and other fields safely
    if (formData.content && typeof formData.content === "string") {
      formData.content = formData.content.trim();

      // ✅ OPTIMIZE BASE64 IMAGES IN CONTENT
      if (formData.content.includes('data:image')) {
        formData.content = await extractAndUploadBase64Images(formData.content);
      }
    }

    if (formData.description && typeof formData.description === "string") {
      formData.description = formData.description.trim();
    }

    if (formData.titleForInnerPage && typeof formData.titleForInnerPage === "string") {
      formData.titleForInnerPage = formData.titleForInnerPage.trim();
    }

    if (formData.metaTitle && typeof formData.metaTitle === "string") {
      formData.metaTitle = formData.metaTitle.trim();
    }

    if (formData.metaDescription && typeof formData.metaDescription === "string") {
      formData.metaDescription = formData.metaDescription.trim();
    }

    if (formData.altText && typeof formData.altText === "string") {
      formData.altText = formData.altText.trim();
    }

    // ✅ Assign Cloudflare R2 URL for primary image
    let fileUrl;
    if (primaryImageFile.key) {
      // For S3/R2 storage
      fileUrl = `${process.env.R2_PUBLIC_ENDPOINT}/${encodeURIComponent(primaryImageFile.key)}`;
    } else if (primaryImageFile.location) {
      // If location is already provided by multer-s3
      fileUrl = primaryImageFile.location;
    } else {
      // For disk storage
      fileUrl = `/uploads/blogs/${primaryImageFile.filename}`;
    }

    formData.primaryImage = fileUrl;

    // ✅ Create the blog
    const blog = await Blog.create(formData);

    res.status(200).json({
      success: true,
      message: "Blog created successfully",
      blog,
    });

  } catch (error) {
    console.error("❌ Error adding blog:", error);

    res.status(400).json({
      success: false,
      error: error.message,
      details: error.errors || undefined
    });
  }
};

// Update a blog
const updateBlog = async (req, res) => {
  try {
    const { id } = req.params;
    let formData = req.body;



    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw Error("Invalid ID!!!");
    }

    const files = req?.files || [];

    // Find existing blog
    const existingBlog = await Blog.findById(id);
    if (!existingBlog) {
      throw Error("No Such Blog");
    }

    // Check if slug is already used by another blog
    if (formData.slug && typeof formData.slug === "string" && formData.slug.trim()) {
      formData.slug = formData.slug
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "")
        .trim();

      const slugExists = await Blog.findOne({
        slug: formData.slug,
        _id: { $ne: id }
      });
      if (slugExists) {
        throw Error("The Slug is already used. Please try another one.");
      }
    }

    // Prepare updated data
    const updatedData = {};

    // ✅ Handle primary image update
    let newPrimaryImage = "";

    files.forEach((file) => {
      const fileUrl = `${process.env.R2_PUBLIC_ENDPOINT}/${encodeURIComponent(file.key)}`;

      if (file.fieldname === "primaryImage") {
        newPrimaryImage = fileUrl;
      }
    });

    // ✅ Set primary image (new upload or existing)
    updatedData.primaryImage = newPrimaryImage || formData.primaryImage || existingBlog.primaryImage;

    // ✅ If primary image is empty, set to empty string
    if (!updatedData.primaryImage) updatedData.primaryImage = "";

    // ✅ Copy other fields
    const textFields = [
      "title",
      "titleForInnerPage",
      "metaTitle",
      "metaDescription",
      "imageAltText",
      "slug",
      "description",
      "content",
      "isActive"
    ];

    textFields.forEach((field) => {
      if (formData[field] !== undefined) {
        // Handle boolean conversion for isActive
        if (field === 'isActive') {
          updatedData[field] = formData[field] === 'true' || formData[field] === true;
        } else {
          updatedData[field] = formData[field];
        }
      }
    });

    // ✅ OPTIMIZE BASE64 IMAGES IN CONTENT (for updates)
    if (updatedData.content && updatedData.content.includes('data:image')) {
      console.log('🔄 Optimizing base64 images in updated blog content...');
      updatedData.content = await extractAndUploadBase64Images(updatedData.content);
      console.log('✅ Updated blog content optimized');
    }

    // ✅ If slug is provided but empty, generate from title
    if (updatedData.slug === "" && updatedData.title) {
      updatedData.slug = updatedData.title
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '')
        .trim();
    }


    // ✅ Save to DB
    const updatedBlog = await Blog.findByIdAndUpdate(
      id,
      { $set: updatedData },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: "Blog updated successfully",
      blog: updatedBlog,
    });
  } catch (error) {
    console.error("❌ Error updating blog:", error);
    res.status(400).json({ success: false, error: error.message });
  }
};


// Soft Deleting a Blog
const deleteBlog = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw Error("Invalid ID!!!");
    }

    // Instead of deleting from DB, mark as inactive
    const blog = await Blog.findByIdAndUpdate(
      id,
      { isActive: false },
      { new: true } // returns the updated document
    );

    if (!blog) {
      throw Error("No Such Blog");
    }

    res.status(200).json({
      message: "Blog soft deleted successfully",
      blog,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};


module.exports = {
  getBlogs,
  getBlog,
  deleteBlog,
  updateBlog,
  addBlog,
};
