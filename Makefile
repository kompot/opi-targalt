start:
	make start_${LANGUAGE}

start_est:
	env RABBITMQ_USER=guest RABBITMQ_PASS=guest docker-compose -f docker-compose.yaml -f docker-compose-tts-est.yaml up

convert:
	make convert_${LANGUAGE}

convert_est:
	docker-compose -f docker-compose-tts-est.yaml -f docker-compose.yaml run opi-targalt pnpm run start -- --language ${LANGUAGE} --input /input --output /output
