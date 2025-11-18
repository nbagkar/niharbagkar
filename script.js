// Smooth scrolling for navigation links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Navbar background change on scroll
const navbar = document.querySelector('.navbar');
window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
        navbar.style.background = 'rgba(255, 255, 255, 0.98)';
        navbar.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.1)';
    } else {
        navbar.style.background = 'rgba(255, 255, 255, 0.95)';
        navbar.style.boxShadow = 'none';
    }
});

// Removed contact form JS handler for Formspree direct submission

// Add animation on scroll
const observerOptions = {
    threshold: 0.1
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('animate');
        }
    });
}, observerOptions);

// Animate About Me blocks and header with fade/slide-up
const aboutAnimates = document.querySelectorAll('.about-animate');
aboutAnimates.forEach((el) => {
    const blockObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                el.classList.add('animated');
            }
        });
    }, observerOptions);
    blockObserver.observe(el);
});

// Dark/Light mode toggle
const themeToggle = document.getElementById('theme-toggle');
const themeIcon = document.getElementById('theme-icon');
const root = document.documentElement;

function setTheme(mode) {
    if (mode === 'dark') {
        root.setAttribute('data-theme', 'dark');
        themeIcon.classList.remove('fa-moon');
        themeIcon.classList.add('fa-sun');
    } else {
        root.removeAttribute('data-theme');
        themeIcon.classList.remove('fa-sun');
        themeIcon.classList.add('fa-moon');
    }
    localStorage.setItem('theme', mode);
}

function getPreferredTheme() {
    const saved = localStorage.getItem('theme');
    if (saved) return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

if (themeToggle) {
    themeToggle.addEventListener('click', () => {
        const isDark = root.getAttribute('data-theme') === 'dark';
        setTheme(isDark ? 'light' : 'dark');
}); 
    // On load
    setTheme(getPreferredTheme());
}

// Hero Slideshow
// To add images to the slideshow:
// 1. Add your images to the images/banner/ folder (or any folder in images/)
// 2. Add the image paths to the array below
// 3. The slideshow will automatically cycle through all images
const heroSlideshow = {
    images: [
        'images/nyc-blue.jpg',
        'images/banner/Screenshot 2024-04-08 at 11.25.51 PM.png',
        'images/banner/Screenshot 2024-04-08 at 11.29.11 PM.png',
        'images/banner/Screenshot 2024-04-08 at 11.30.09 PM.png',
        'images/banner/Screenshot 2024-04-08 at 11.31.32 PM.png',
        'images/banner/Screenshot 2024-04-08 at 11.34.28 PM.png',
        'images/banner/Screenshot 2024-04-08 at 11.35.10 PM.png',
        'images/banner/Screenshot 2024-04-08 at 11.35.40 PM.png',
        'images/banner/Screenshot 2024-04-08 at 11.36.20 PM.png',
        'images/banner/Screenshot 2024-04-08 at 11.36.37 PM.png',
    ],
    currentIndex: 0,
    slides: [],
    dots: [],
    autoPlayInterval: null,
    autoPlayDelay: 5000, // 5 seconds

    init() {
        const slideshowContainer = document.querySelector('.hero-slideshow');
        if (!slideshowContainer) return;

        // If no images configured, use default
        if (this.images.length === 0) {
            this.images = ['images/nyc-blue.jpg'];
        }

        // Preload all images first
        this.preloadImages().then(() => {
            // Create slides dynamically based on number of images
            slideshowContainer.innerHTML = '';
            this.images.forEach((imagePath, index) => {
                const slide = document.createElement('div');
                slide.className = 'hero-slide';
                if (index === 0) slide.classList.add('active');
                // Encode the image path to handle spaces and special characters
                // Only encode the filename parts, not the path separators
                const pathParts = imagePath.split('/');
                const encodedParts = pathParts.map(part => encodeURIComponent(part));
                const encodedPath = encodedParts.join('/');
                slide.style.backgroundImage = `url('${encodedPath}')`;
                slideshowContainer.appendChild(slide);
                this.slides.push(slide);
            });

            this.setupControls();
        });
    },

    preloadImages() {
        const promises = this.images.map(imagePath => {
            return new Promise((resolve, reject) => {
                const img = new Image();
                const pathParts = imagePath.split('/');
                const encodedParts = pathParts.map(part => encodeURIComponent(part));
                const encodedPath = encodedParts.join('/');
                img.onload = () => resolve();
                img.onerror = () => {
                    console.warn(`Failed to load image: ${imagePath}`);
                    resolve(); // Continue even if one image fails
                };
                img.src = encodedPath;
            });
        });
        return Promise.all(promises);
    },

    setupControls() {

        // Create dots
        const dotsContainer = document.querySelector('.hero-slideshow-dots');
        if (dotsContainer && this.images.length > 1) {
            this.images.forEach((_, index) => {
                const dot = document.createElement('button');
                dot.className = 'slideshow-dot';
                if (index === 0) dot.classList.add('active');
                dot.setAttribute('aria-label', `Go to slide ${index + 1}`);
                dot.addEventListener('click', () => this.goToSlide(index));
                dotsContainer.appendChild(dot);
                this.dots.push(dot);
            });
        } else if (dotsContainer) {
            dotsContainer.style.display = 'none';
        }

        // Hide controls if only one image
        if (this.images.length <= 1) {
            const controls = document.querySelector('.hero-slideshow-controls');
            if (controls) controls.style.display = 'none';
        }

        // Setup navigation buttons
        const prevBtn = document.querySelector('.slideshow-prev');
        const nextBtn = document.querySelector('.slideshow-next');
        
        if (prevBtn) {
            prevBtn.addEventListener('click', () => this.prevSlide());
        }
        if (nextBtn) {
            nextBtn.addEventListener('click', () => this.nextSlide());
        }

        // Start auto-play if more than one image
        if (this.images.length > 1) {
            this.startAutoPlay();
        }

        // Pause on hover
        const hero = document.querySelector('.hero');
        if (hero) {
            hero.addEventListener('mouseenter', () => this.stopAutoPlay());
            hero.addEventListener('mouseleave', () => this.startAutoPlay());
        }
    },

    goToSlide(index) {
        if (index < 0 || index >= this.images.length) return;

        // Remove active class from current slide and dot
        this.slides[this.currentIndex].classList.remove('active');
        if (this.dots[this.currentIndex]) {
            this.dots[this.currentIndex].classList.remove('active');
        }

        // Set new current index
        this.currentIndex = index;

        // Add active class to new slide and dot
        this.slides[this.currentIndex].classList.add('active');
        if (this.dots[this.currentIndex]) {
            this.dots[this.currentIndex].classList.add('active');
        }

        // Restart auto-play
        this.startAutoPlay();
    },

    nextSlide() {
        const nextIndex = (this.currentIndex + 1) % this.images.length;
        this.goToSlide(nextIndex);
    },

    prevSlide() {
        const prevIndex = (this.currentIndex - 1 + this.images.length) % this.images.length;
        this.goToSlide(prevIndex);
    },

    startAutoPlay() {
        this.stopAutoPlay();
        if (this.images.length > 1) {
            this.autoPlayInterval = setInterval(() => {
                this.nextSlide();
            }, this.autoPlayDelay);
        }
    },

    stopAutoPlay() {
        if (this.autoPlayInterval) {
            clearInterval(this.autoPlayInterval);
            this.autoPlayInterval = null;
        }
    }
};

// Initialize slideshow when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => heroSlideshow.init());
} else {
    heroSlideshow.init();
} 
