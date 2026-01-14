# Tecmarsign Academy

A full-featured education platform for marketing courses, handling enrollment, and managing learning operations. Supports Tech, Marketing, and Design courses with online and offline learning options.

## Features

- **Course Management**: Browse and enroll in courses across Tech, Marketing, and Design categories
- **Role-Based Dashboards**: Separate dashboards for Admin, Student, and Tutor roles
- **Phase-Based Learning**: Courses structured in phases with lessons, assignments, and materials
- **Enrollment System**: Secure enrollment with payment status tracking
- **Assignment Submissions**: Students submit work, tutors grade and provide feedback
- **Progress Tracking**: Track lesson completion and course progress

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite
- **Styling**: Tailwind CSS, shadcn/ui
- **Backend**: Lovable Cloud (Supabase)
- **State Management**: TanStack React Query
- **Routing**: React Router DOM

## Getting Started

### Prerequisites

- Node.js 18+ and npm

### Installation

```sh
# Clone the repository
git clone <YOUR_GIT_URL>

# Navigate to project directory
cd <YOUR_PROJECT_NAME>

# Install dependencies
npm install

# Start development server
npm run dev
```

## Project Structure

```
src/
├── components/
│   ├── admin/       # Admin dashboard components
│   ├── courses/     # Course display and enrollment
│   ├── dashboard/   # Role-based dashboards
│   ├── home/        # Landing page sections
│   ├── layout/      # Navbar, Footer, PageLayout
│   ├── student/     # Student learning components
│   ├── tutor/       # Tutor management components
│   └── ui/          # shadcn/ui components
├── hooks/           # Custom React hooks
├── pages/           # Route pages
└── integrations/    # Backend integrations
```

## Deployment

Open [Lovable](https://lovable.dev) and click Share → Publish to deploy your app.

## Custom Domain

To connect a custom domain, navigate to Project > Settings > Domains in Lovable.

## License

Proprietary - Tecmarsign Academy
