#!/usr/bin/env bash
# One registration on hottopic-perf with curl, as in the team's Postman suite (lookup, epsilon/create,
# register Gen-2, default address). Prints status + body of every step. Creates a real account and a
# loyalty profile that cannot be deleted: run it by hand, once.
#   PASS='Abcd1234$' bash prep/register-curl.sh      # try another password
#   DOMAIN=example.org bash prep/register-curl.sh   # try another email domain (default byom.de)
#   UA='...' bash prep/register-curl.sh              # try another user agent
set -euo pipefail

BASE=${BASE:-https://platform.poq.io/clients/hottopic-perf/v2}
APP=198
UID_=$(uuidgen | tr 'A-Z' 'a-z')
UA=${UA:-'com.hottopic.ios/22.9.0 iOS/15.7.2POQQAALLOW'}
ID=$(uuidgen | tr -d - | cut -c1-12 | tr 'A-Z' 'a-z')
EMAIL="k6reg.${ID}@${DOMAIN:-byom.de}"
PHONE="2$((RANDOM % 8 + 2))$((RANDOM % 10))$((RANDOM % 8 + 2))$(printf '%06d' $((RANDOM * 30 % 1000000)))"
PASS=${PASS:-"Abcd${ID}\$"}
FIRST=Riley LAST=Sample

H=(-H "content-type: application/json; charset=UTF-8" -H "accept-language: en-US,en;q=0.9"
   -H "platform: iphone" -H "appuseragent: Poq-Native-iOS-App" -H "poq-user-id: $UID_"
   -H "version-code: 25.1" -H "user-agent: $UA" -H "currency-code: USD"
   -H "poq-app-identifier: 7114a2fb-b812-4d75-90b2-8f2c043caef2" -H "poq-app-id: $APP"
   -H "poq-currency-identifier: USD" -H "poq-country-identifier: US")

call() { # name path body [extra curl args]
  local name=$1 path=$2 body=$3; shift 3
  echo "== $name"
  curl -sS -m 30 -o /tmp/ht_reg_body -w '%{http_code}\n' "${H[@]}" "$@" -X POST "$BASE$path" --data "$body"
  head -c 1500 /tmp/ht_reg_body | sed -E 's/"(encryptedPassword|accessToken|password)":"[^"]*"/"\1":"***"/g'; echo
}

call lookup "/account/register/lookup/$APP" \
  "{\"firstName\":\"$FIRST\",\"emailAddress\":\"$EMAIL\",\"lastName\":\"$LAST\",\"phoneNumber\":\"$PHONE\"}"

call epsilon "/epsilon/create" \
  "{\"firstName\":\"$FIRST\",\"lastName\":\"$LAST\",\"emailAddress\":\"$EMAIL\",\"birthDate\":\"02/13/2001\",\"addresses\":[{\"countryCode\":\"USA\",\"addressLine1\":\"3855 E octillo rd\",\"city\":\"Phoenix\",\"stateCode\":\"AZ\",\"postalCode\":\"91748\"}],\"phoneNumber\":\"$PHONE\"}"
CARD=$(sed -E 's/.*"cardNumber":"([^"]*)".*/\1/' /tmp/ht_reg_body)
PROF=$(sed -E 's/.*"profileId":"([^"]*)".*/\1/' /tmp/ht_reg_body)

call register "/account/register/$APP/$UID_" \
  "{\"profile\":{\"phone\":\"$PHONE\",\"allowDataSharing\":false,\"firstName\":\"$FIRST\",\"customData\":{\"cardNumber\":\"$CARD\",\"profileId\":\"$PROF\"},\"birthDate\":\"02/13/2001\",\"email\":\"$EMAIL\",\"isPromotion\":false,\"encryptedPassword\":\"$PASS\",\"lastName\":\"$LAST\"},\"credentials\":{\"username\":\"$EMAIL\",\"password\":\"$PASS\"},\"isPromotion\":false}"
ENC=$(sed -E 's/.*"encryptedPassword":"([^"]*)".*/\1/' /tmp/ht_reg_body)

AUTH=$(printf '%s:%s' "$EMAIL" "$ENC" | base64)
call address "/account/address/$APP/$UID_" \
  "{\"isDefaultBilling\":true,\"firstName\":\"$FIRST\",\"lastName\":\"$LAST\",\"address1\":\"3855 E octillo rd\",\"city\":\"Phoenix\",\"state\":\"AZ\",\"country\":\"US\",\"postCode\":91748,\"phone\":\"$PHONE\"}" \
  -H "Authorization: Basic $AUTH"
rm -f /tmp/ht_reg_body
