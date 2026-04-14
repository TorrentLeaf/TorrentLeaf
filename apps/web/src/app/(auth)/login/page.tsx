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
import { useAuthStore } from '@/store/auth'
import { useToast } from '@/hooks/use-toast'

const LoginSchema = z.object({
  email: z.string().email('e-mail inválido'),
  password: z.string().min(8, 'mínimo 8 caracteres'),
})

type LoginInput = z.infer<typeof LoginSchema>

export default function LoginPage() {
  const router = useRouter()
  const { toast } = useToast()
  const { register, handleSubmit, formState } = useForm<LoginInput>({
    resolver: zodResolver(LoginSchema),
  })

  async function onSubmit(values: LoginInput) {
    try {
      const { data } = await api.post<{
        accessToken: string
        refreshToken: string
        user: { id: string; username: string; email: string; role: 'user' | 'admin' }
      }>('/auth/login', values)
      useAuthStore.getState().setTokens(data.accessToken, data.refreshToken)
      useAuthStore.getState().setUser(data.user)
      router.push('/')
    } catch (err) {
      toast({
        title: 'Falha no login',
        description: err instanceof Error ? err.message : 'Tente novamente.',
        variant: 'destructive',
      })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Entrar</CardTitle>
        <CardDescription>Acesse sua biblioteca e continue lendo.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">E-mail</label>
            <Input type="email" autoComplete="email" {...register('email')} />
            {formState.errors.email && (
              <p className="text-xs text-destructive">{formState.errors.email.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Senha</label>
            <Input type="password" autoComplete="current-password" {...register('password')} />
            {formState.errors.password && (
              <p className="text-xs text-destructive">{formState.errors.password.message}</p>
            )}
          </div>
          <Button type="submit" className="w-full" disabled={formState.isSubmitting}>
            Entrar
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Não tem conta?{' '}
            <Link href="/register" className="text-accent hover:underline">
              Criar agora
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  )
}
