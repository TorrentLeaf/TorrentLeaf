'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'

const RegisterSchema = z.object({
  username: z.string().min(3, 'minimum 3 characters').max(50),
  email: z.string().email('invalid email'),
  password: z.string().min(8, 'minimum 8 characters'),
})

type RegisterInput = z.infer<typeof RegisterSchema>

export default function RegisterPage() {
  const router = useRouter()
  const { toast } = useToast()
  const { register, handleSubmit, formState } = useForm<RegisterInput>({
    resolver: zodResolver(RegisterSchema),
  })

  async function onSubmit(values: RegisterInput) {
    try {
      await api.post('/auth/register', values)
      toast({ title: 'Account created', description: 'Sign in to continue.' })
      router.push('/login')
    } catch (err) {
      toast({
        title: 'Sign-up failed',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create account</CardTitle>
        <CardDescription>Your personal library, self-hosted.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Username</label>
            <Input autoComplete="username" {...register('username')} />
            {formState.errors.username && (
              <p className="text-xs text-destructive">{formState.errors.username.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Email</label>
            <Input type="email" autoComplete="email" {...register('email')} />
            {formState.errors.email && (
              <p className="text-xs text-destructive">{formState.errors.email.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Password</label>
            <Input type="password" autoComplete="new-password" {...register('password')} />
            {formState.errors.password && (
              <p className="text-xs text-destructive">{formState.errors.password.message}</p>
            )}
          </div>
          <Button type="submit" className="w-full" disabled={formState.isSubmitting}>
            Create account
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link href="/login" className="text-accent hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  )
}
