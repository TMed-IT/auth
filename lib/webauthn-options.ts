import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  type AuthenticatorTransportFuture,
  type Base64URLString,
} from '@simplewebauthn/server'

export const createPasskeyRegistrationOptions = (input: {
  rpName: string
  rpID: string
  userId: Uint8Array<ArrayBuffer>
  userName: string
  userDisplayName: string
  excludeCredentials: Array<{
    id: string
    transports?: AuthenticatorTransportFuture[]
  }>
}) => generateRegistrationOptions({
  rpName: input.rpName,
  rpID: input.rpID,
  userID: input.userId,
  userName: input.userName,
  userDisplayName: input.userDisplayName,
  attestationType: 'none',
  excludeCredentials: input.excludeCredentials.map((credential) => ({
    id: credential.id as Base64URLString,
    transports: credential.transports,
  })),
  authenticatorSelection: {
    residentKey: 'required',
    userVerification: 'required',
  },
})

export const createPasskeyAuthenticationOptions = (rpID: string) =>
  generateAuthenticationOptions({
    rpID,
    userVerification: 'required',
  })
