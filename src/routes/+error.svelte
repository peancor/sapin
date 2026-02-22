<script lang="ts">
    import { page } from '$app/state';
</script>

<div class="error-container">
    <div class="error-content">
        <div class="error-image-placeholder">
            <img src="/images/sapin_error.webp" alt="Error illustration" class="error-image">
        </div>
        <h1 class="error-code">{page.status}</h1>
        <p class="error-message">{page.error?.message}</p>
        <a href="/" class="back-button">Inicio</a>
    </div>
</div>

<style>    
    .error-container {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 2rem;
        background-color: #f8fafc;
    }

    .error-content {
        text-align: center;
        max-width: 600px;
    }

    .error-image-placeholder {
        margin-bottom: 2rem;
    }

    .placeholder-box {
        width: 200px;
        height: 200px;
        margin: 0 auto;
        background-color: #e2e8f0;
        border-radius: 1rem;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #64748b;
        font-size: 0.875rem;
    }

    .error-code {
        font-size: 4rem;
        font-weight: 700;
        color: #1e293b;
        margin: 0 0 1rem 0;
    }

    .error-message {
        font-size: 1.25rem;
        color: #64748b;
        margin-bottom: 2rem;
    }

    .back-button {
        display: inline-block;
        background-color: #3b82f6;
        color: white;
        padding: 0.75rem 1.5rem;
        border-radius: 0.5rem;
        text-decoration: none;
        font-weight: 500;
        transition: background-color 0.2s;
    }

    .back-button:hover {
        background-color: #2563eb;
    }

    .error-image {
        width: 200px;
        height: auto;
        margin: 0 auto;
        border-radius: 1rem;
    }
</style>