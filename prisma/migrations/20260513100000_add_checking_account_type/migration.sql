-- AccountType에 CHECKING(일반 입출금 계좌) 추가
ALTER TYPE "AccountType" ADD VALUE 'CHECKING' BEFORE 'SAVINGS';
