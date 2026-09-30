// migrate-wp.js
require('dotenv').config();
const mongoose = require('mongoose');

// ⚠️ UPDATE THIS PATH to point to your actual Blog model file
const Blog = require('./model/blogModel');

const WP_API_URL = 'https://lemonchiffon-whale-379446.hostingersite.com/wp-json/wp/v2/pages?author=4&_embed&per_page=100';

async function patchBlogSEO() {
    try {
        console.log('⏳ Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/your_db_name');
        console.log('✅ Connected to MongoDB.');

        console.log('⏳ Fetching WordPress pages...');
        const response = await fetch(WP_API_URL);
        const wpPages = await response.json();
        console.log(`✅ Found ${wpPages.length} pages in WordPress.`);

        let successCount = 0;
        let notFoundCount = 0;

        for (const wp of wpPages) {
            console.log(`\n⏳ Checking: ${wp.slug}`);

            // Extract the Yoast SEO data (with safe fallbacks just in case)
            const metaTitle = wp.yoast_head_json?.title || wp.title.rendered;
            const metaDescription = wp.yoast_head_json?.description || '';

            console.log("slug", wp.slug)
            console.log("Title", wp.title.rendered)

            const blog = await Blog.findOneAndUpdate(
                { title: wp.title.rendered },   // find blog with this title
                { $set: { slug: wp.slug } },    // update slug
                { new: true }                   // return updated document
            ).select('slug title');

            console.log(blog);
            // Find the blog by slug and update ONLY the meta fields
            // const updatedBlog = await Blog.findOneAndUpdate(
            //     { title: wp.title.rendered }, // Search criteria
            //     { 
            //         $set: { 
            //             metaTitle: metaTitle, 
            //             metaDescription: metaDescription 
            //         } 
            //     }, // The fields to update
            //     { new: true } // Return the updated document
            // );
            continue;

            if (updatedBlog) {
                console.log(`✅ Updated SEO for: ${wp.title.rendered}`);
                successCount++;
            } else {
                console.log(`⚠️ Could not find slug in MongoDB: ${wp.slug}`);
                notFoundCount++;
            }
        }

        console.log(`\n🎉 SEO Patch complete! Successfully updated ${successCount} blogs.`);
        if (notFoundCount > 0) {
            console.log(`⚠️ ${notFoundCount} blogs were skipped because their slugs didn't match.`);
        }

        process.exit(0);

    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

patchBlogSEO();